import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatSocketService } from '../../core/services/chat-socket.service';
import { MailboxService } from '../../core/services/mailbox.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/services/api.service';
import { InboxEmail, InboxRow, Mailbox } from '../../core/models/api.models';
import { copyText } from '../../core/utils/image';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui-states';

const PAGE = 20;

/** "Sapphire <orders@x.com>" -> "Sapphire", "orders@x.com" -> "orders@x.com" */
const senderName = (from: string | null): string => {
  const f = (from ?? '').trim();
  const name = /^"?([^"<]+?)"?\s*</.exec(f)?.[1]?.trim();
  return name || f.replace(/[<>]/g, '') || 'Unknown sender';
};

/**
 * The customer's Inbox: the address to type at any shop's checkout, every email that arrives there, and — for order
 * emails — the order read from it, ready to turn into an order (/app/inbox and /app/inbox/:id).
 */
@Component({
  selector: 'app-inbox',
  imports: [RouterLink, IonIcon, IonSpinner, TimeAgoPipe, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './inbox.page.html',
  styleUrl: './inbox.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InboxPage {
  private mail = inject(MailboxService);
  private auth = inject(AuthService);
  private socket = inject(ChatSocketService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Route param: an email is open when set (bound by withComponentInputBinding). */
  readonly id = input<string>();

  readonly senderName = senderName;

  // address
  box = signal<Mailbox | null>(null);
  copied = signal(false);
  /** Known right after sign-in, before the address call returns. */
  address = computed(() => this.box()?.address ?? this.auth.user()?.mailbox_address ?? null);

  // list
  rows = signal<InboxRow[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal<string | null>(null);
  hasMore = signal(false);
  unreadOnly = signal(false);
  unread = this.mail.unread;
  private page = 1;
  private listSub?: Subscription;

  // detail
  email = signal<InboxEmail | null>(null);
  detailLoading = signal(false);
  detailError = signal<string | null>(null);
  deleting = signal(false);
  private detailSub?: Subscription;

  /** The email's HTML inside a sandboxed frame: no scripts can run, links open in a new tab. */
  frame = computed<SafeHtml | null>(() => {
    const html = this.email()?.html;
    if (!html) return null;
    const doc =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'; font-src https: data:">' +
      '<base target="_blank"><style>body{margin:0;padding:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;word-break:break-word}img{max-width:100%;height:auto}</style>' +
      `</head><body>${html}</body></html>`;
    // Safe by construction: the frame is sandboxed without allow-scripts / allow-same-origin and the CSP above blocks scripts
    return this.sanitizer.bypassSecurityTrustHtml(doc);
  });

  constructor() {
    this.mail.address().pipe(takeUntilDestroyed()).subscribe({ next: (b) => this.box.set(b), error: () => undefined });

    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.openEmail(id) : this.loadList()));
    });

    // Live: a new email refreshes the list; a finished order draft refreshes the open email
    this.socket.mailbox$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (!this.id()) this.loadList(true);
      else if (e.kind === 'update' && e.id === this.id()) this.openEmail(e.id, true);
    });

    this.destroyRef.onDestroy(() => {
      this.listSub?.unsubscribe();
      this.detailSub?.unsubscribe();
    });
  }

  // ───────── list ─────────

  /** `quiet`: refresh in place (no skeleton) after a live event. */
  loadList(quiet = false): void {
    this.listSub?.unsubscribe();
    this.page = 1;
    if (!quiet) this.loading.set(true);
    this.error.set(null);
    this.listSub = this.mail.list({ page: 1, limit: PAGE, unread: this.unreadOnly() }).subscribe({
      next: ({ items, meta }) => {
        this.rows.set(items);
        this.hasMore.set(!!meta.hasMore);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.mail.list({ page: this.page + 1, limit: PAGE, unread: this.unreadOnly() }).subscribe({
      next: ({ items, meta }) => {
        const seen = new Set(this.rows().map((r) => r.id));
        this.rows.update((list) => [...list, ...items.filter((r) => !seen.has(r.id))]);
        this.page += 1;
        this.hasMore.set(!!meta.hasMore);
        this.loadingMore.set(false);
      },
      error: (err: unknown) => {
        this.toast.error(err);
        this.loadingMore.set(false);
      },
    });
  }

  toggleUnread(): void {
    this.unreadOnly.update((v) => !v);
    this.loadList();
  }

  markAllRead(): void {
    this.mail.readAll().subscribe({
      next: () => this.rows.update((list) => list.map((r) => ({ ...r, is_read: true }))),
      error: (err: unknown) => this.toast.error(err),
    });
  }

  async copyAddress(): Promise<void> {
    const a = this.address();
    if (!a) return;
    if (await copyText(a)) {
      this.toast.success("Email address copied — paste it at the shop's checkout.");
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } else {
      this.toast.error('Could not copy — your address is ' + a + '.');
    }
  }

  // ───────── detail ─────────

  openEmail(id: string, quiet = false): void {
    this.detailSub?.unsubscribe();
    if (!quiet) {
      this.detailLoading.set(true);
      this.email.set(null);
    }
    this.detailError.set(null);
    this.detailSub = this.mail.open(id).subscribe({
      next: (e) => {
        this.email.set(e);
        this.detailLoading.set(false);
      },
      error: (err: Error) => {
        this.detailError.set(err.message);
        this.detailLoading.set(false);
      },
    });
  }

  remove(): void {
    const e = this.email();
    if (!e || this.deleting()) return;
    this.deleting.set(true);
    this.mail.remove(e.id).subscribe({
      next: () => {
        this.toast.success('Email deleted.');
        this.deleting.set(false);
        void this.router.navigate(['/app/inbox']);
      },
      error: (err: unknown) => {
        this.toast.error(errorMessage(err));
        this.deleting.set(false);
      },
    });
  }
}
