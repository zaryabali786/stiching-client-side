import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ChatSocketService } from './chat-socket.service';
import { ToastService } from './toast.service';
import { ApiResult, InboxEmail, InboxRow, Mailbox, OrderImport, Paged } from '../models/api.models';

/** The customer's Inbox: emails that reach their personal shopping address (/client/inbox/*). */
@Injectable({ providedIn: 'root' })
export class MailboxService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private socket = inject(ChatSocketService);
  private toast = inject(ToastService);

  /** Unread emails, for the badge in the header. */
  readonly unread = signal(0);

  constructor() {
    effect(() => {
      const authed = this.auth.isAuthenticated();
      untracked(() => (authed ? this.refreshUnread() : this.unread.set(0)));
    });
    // A new email: update the badge right away (the Inbox page listens to the same stream to refresh its list)
    this.socket.mailbox$.subscribe((e) => {
      if (e.kind !== 'new') return;
      this.refreshUnread();
      this.toast.info('New email in your Inbox.');
    });
    this.socket.reconnected$.subscribe(() => this.refreshUnread());
  }

  refreshUnread(): void {
    this.api.get<{ unread: number }>('/client/inbox/unread-count').subscribe({
      next: (r) => this.unread.set(r.unread),
      error: () => undefined, // the badge is a convenience: never show an error for it
    });
  }

  address(): Observable<Mailbox> {
    return this.api.get<Mailbox>('/client/inbox/address').pipe(tap((m) => this.unread.set(m.unread)));
  }

  list(query: { page: number; limit?: number; search?: string; unread?: boolean }): Observable<Paged<InboxRow, { unread: number }>> {
    return this.api
      .getPage<InboxRow, { unread: number }>('/client/inbox', {
        page: query.page,
        limit: query.limit ?? 20,
        search: query.search,
        unread: query.unread ? 1 : undefined,
      })
      .pipe(tap(({ meta }) => typeof meta.unread === 'number' && this.unread.set(meta.unread)));
  }

  /** Opening an email marks it read. */
  open(id: string): Observable<InboxEmail> {
    return this.api.get<InboxEmail>(`/client/inbox/${encodeURIComponent(id)}`).pipe(tap(() => this.refreshUnread()));
  }

  readAll(): Observable<ApiResult<{ unread: number }>> {
    return this.api.post<{ unread: number }>('/client/inbox/read-all').pipe(tap(() => this.unread.set(0)));
  }

  remove(id: string): Observable<ApiResult<null>> {
    return this.api.delete(`/client/inbox/${encodeURIComponent(id)}`).pipe(tap(() => this.refreshUnread()));
  }

  /** The order draft read from an email (prefills the new-order form). */
  importDraft(id: string): Observable<OrderImport> {
    return this.api.get<OrderImport>(`/client/imports/${encodeURIComponent(id)}`);
  }
}
