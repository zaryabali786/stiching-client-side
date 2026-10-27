import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { ApprovalsService } from '../../core/services/approvals.service';
import { OrderEventsService } from '../../core/services/order-events.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/services/api.service';
import { ApprovalArticle, ApprovalOrder, ApprovalState } from '../../core/models/api.models';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui-states';

type Filter = 'all' | 'pending' | 'approved' | 'rejected';

const LABEL: Record<ApprovalState, string> = {
  pending: 'Waiting for you',
  approved: 'Approved',
  rejected: 'Rejected',
  in_progress: 'Being stitched',
};

/**
 * Approvals: for every order whose photos were sent, each article and where it stands — waiting for you,
 * approved, rejected (sent back to the tailor) or still being stitched. A waiting article can be approved or rejected here.
 */
@Component({
  selector: 'app-approvals',
  imports: [RouterLink, IonIcon, TimeAgoPipe, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './approvals.page.html',
  styleUrl: './approvals.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalsPage {
  protected svc = inject(ApprovalsService);
  private toast = inject(ToastService);

  protected readonly label = LABEL;
  protected filter = signal<Filter>('all');
  /** `orderId:unitId` of the article being sent to the server / being rejected */
  protected busyKey = signal<string | null>(null);
  protected rejectingKey = signal<string | null>(null);
  protected note = signal('');
  /** Articles whose details the customer opened or closed by hand; the others follow the default (open while the article waits for a decision). */
  private manual = signal<ReadonlyMap<string, boolean>>(new Map());

  protected isOpen(o: ApprovalOrder, a: ApprovalArticle): boolean {
    return this.manual().get(this.k(o, a)) ?? a.status === 'pending';
  }

  protected toggle(o: ApprovalOrder, a: ApprovalArticle): void {
    const next = !this.isOpen(o, a);
    this.manual.update((m) => new Map(m).set(this.k(o, a), next));
  }

  protected totals = computed(() => {
    const t = { all: 0, pending: 0, approved: 0, rejected: 0 };
    for (const o of this.svc.list())
      for (const a of o.articles) {
        if (a.status === 'in_progress') continue;
        t.all++;
        t[a.status]++;
      }
    return t;
  });

  /** Orders shown for the chosen filter, each with only its matching articles ("all" keeps every article of the order). */
  protected shown = computed(() => {
    const f = this.filter();
    return this.svc
      .list()
      .map((o) => ({ ...o, visible: f === 'all' ? o.articles : o.articles.filter((a) => a.status === f) }))
      .filter((o) => o.visible.length);
  });

  protected summary(o: ApprovalOrder): string {
    const done = o.articles.filter((a) => a.status === 'approved').length;
    const wait = o.articles.filter((a) => a.status === 'pending').length;
    const rej = o.articles.filter((a) => a.status === 'rejected').length;
    const parts = [`${done} of ${o.articles.length} approved`];
    if (wait) parts.push(`${wait} waiting`);
    if (rej) parts.push(`${rej} rejected`);
    return parts.join(' · ');
  }

  constructor() {
    this.svc.refresh(true);
    // a piece may be approved / changed from another device, or a new one may arrive
    inject(OrderEventsService)
      .updated$.pipe(takeUntilDestroyed())
      .subscribe(() => this.svc.refresh());
  }

  protected k(o: ApprovalOrder, a: ApprovalArticle): string {
    return this.svc.key(o, a);
  }

  protected approve(o: ApprovalOrder, a: ApprovalArticle): void {
    if (this.busyKey()) return;
    this.busyKey.set(this.k(o, a));
    this.svc.approve(o, a).subscribe({
      next: (res) => {
        this.toast.success(res.message || 'Approved.');
        this.busyKey.set(null);
      },
      error: (err: unknown) => {
        this.toast.error(errorMessage(err));
        this.busyKey.set(null);
        this.svc.refresh();
      },
    });
  }

  protected startReject(o: ApprovalOrder, a: ApprovalArticle): void {
    this.note.set('');
    this.rejectingKey.set(this.k(o, a));
  }

  protected cancelReject(): void {
    this.rejectingKey.set(null);
  }

  protected onNote(ev: Event): void {
    this.note.set((ev.target as HTMLTextAreaElement).value);
  }

  protected sendReject(o: ApprovalOrder, a: ApprovalArticle): void {
    const note = this.note().trim();
    if (note.length < 3) {
      this.toast.error('Please write what should be changed.');
      return;
    }
    if (this.busyKey()) return;
    this.busyKey.set(this.k(o, a));
    this.svc.reject(o, a, note).subscribe({
      next: (res) => {
        this.toast.success(res.message || 'Your change request was sent.');
        this.rejectingKey.set(null);
        this.busyKey.set(null);
      },
      error: (err: unknown) => {
        this.toast.error(errorMessage(err));
        this.busyKey.set(null);
        this.svc.refresh();
      },
    });
  }
}
