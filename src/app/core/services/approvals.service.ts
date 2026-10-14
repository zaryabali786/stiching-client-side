import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiResult, ApprovalArticle, ApprovalOrder } from '../models/api.models';
import { OrderService } from './order.service';

/** Orders whose photos were sent for approval: feeds the Approvals page and the badges in the side menu. */
@Injectable({ providedIn: 'root' })
export class ApprovalsService {
  private orders = inject(OrderService);

  readonly list = signal<ApprovalOrder[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Articles waiting for the customer's decision. */
  readonly count = computed(() => this.list().reduce((n, o) => n + o.articles.filter((a) => a.status === 'pending').length, 0));

  readonly key = (o: ApprovalOrder, a: ApprovalArticle): string => `${o.order_id}:${a.unit_id}`;

  /** Quiet by default (the badge is a convenience); `showLoading` for the page's first load. */
  refresh(showLoading = false): void {
    if (showLoading && !this.list().length) this.loading.set(true);
    this.orders.approvalsOverview().subscribe({
      next: (r) => {
        this.list.set(r.orders);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: Error) => {
        if (showLoading) this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }

  approve(o: ApprovalOrder, a: ApprovalArticle): Observable<ApiResult<unknown>> {
    return this.orders.approve(o.order_id, a.unit_id).pipe(tap(() => this.mark(o, a, 'approved')));
  }

  /** Reject = send the article back to the tailor with a note about what to change. */
  reject(o: ApprovalOrder, a: ApprovalArticle, note: string): Observable<ApiResult<null>> {
    return this.orders.requestChanges(o.order_id, { unit_id: a.unit_id, note }).pipe(tap(() => this.mark(o, a, 'rejected', note)));
  }

  /** Reflect the decision at once; the next refresh confirms it. */
  private mark(o: ApprovalOrder, a: ApprovalArticle, status: 'approved' | 'rejected', note?: string): void {
    const now = new Date().toISOString();
    this.list.update((orders) =>
      orders.map((x) =>
        x.order_id !== o.order_id
          ? x
          : { ...x, articles: x.articles.map((y) => (y.unit_id === a.unit_id ? { ...y, status, decided_at: now, change_request: status === 'rejected' ? (note ?? null) : null } : y)) },
      ),
    );
  }
}
