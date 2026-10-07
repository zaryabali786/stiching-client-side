import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subscription, filter, switchMap, timer, catchError, EMPTY } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { AppNotification, NotificationMeta } from '../models/api.models';

const PAGE_SIZE = 15;
const POLL_MS = 30_000;

/** Notification centre: unread polling + paginated feed for the bell modal. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly unreadCount = signal(0);
  readonly isModalOpen = signal(false);

  readonly items = signal<AppNotification[]>([]);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);
  readonly markingAll = signal(false);
  private page = 1;

  private poll?: Subscription;
  private feed?: Subscription;

  constructor() {
    // Poll only while a customer is signed in; stop (and reset) on logout.
    effect(() => {
      const authed = this.auth.isAuthenticated();
      untracked(() => (authed ? this.startPolling() : this.stopPolling()));
    });
  }

  openModal(): void {
    this.isModalOpen.set(true);
    this.load();
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  /** (Re)load the first page. */
  load(): void {
    this.feed?.unsubscribe();
    this.page = 1;
    this.loading.set(true);
    this.error.set(null);
    this.feed = this.api
      .getPage<AppNotification, NotificationMeta>('/notifications', { page: 1, limit: PAGE_SIZE })
      .subscribe({
        next: ({ items, meta }) => {
          this.items.set(items);
          this.hasMore.set(meta.hasMore);
          if (typeof meta.unreadCount === 'number') this.unreadCount.set(meta.unreadCount);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }

  loadMore(): void {
    if (!this.hasMore() || this.loadingMore() || this.loading()) return;
    this.loadingMore.set(true);
    const next = this.page + 1;
    this.feed = this.api
      .getPage<AppNotification, NotificationMeta>('/notifications', { page: next, limit: PAGE_SIZE })
      .subscribe({
        next: ({ items, meta }) => {
          this.page = next;
          const seen = new Set(this.items().map((n) => n.id));
          this.items.update((list) => [...list, ...items.filter((n) => !seen.has(n.id))]);
          this.hasMore.set(meta.hasMore);
          this.loadingMore.set(false);
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.loadingMore.set(false);
        },
      });
  }

  markRead(n: AppNotification): void {
    if (n.read_at) return;
    const now = new Date().toISOString();
    this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
    this.unreadCount.update((c) => Math.max(0, c - 1));
    this.api.post<{ unreadCount: number }>(`/notifications/${n.id}/read`).subscribe({
      next: ({ data }) => {
        if (typeof data?.unreadCount === 'number') this.unreadCount.set(data.unreadCount);
      },
      error: () => this.refreshCount(),
    });
  }

  markAllRead(onError?: (err: unknown) => void): void {
    if (this.markingAll()) return;
    this.markingAll.set(true);
    this.api.post('/notifications/read-all').subscribe({
      next: () => {
        const now = new Date().toISOString();
        this.items.update((list) => list.map((x) => (x.read_at ? x : { ...x, read_at: now })));
        this.unreadCount.set(0);
        this.markingAll.set(false);
      },
      error: (err) => {
        this.markingAll.set(false);
        onError?.(err);
      },
    });
  }

  remove(n: AppNotification, onError?: (err: unknown) => void): void {
    const before = this.items();
    this.items.update((list) => list.filter((x) => x.id !== n.id));
    if (!n.read_at) this.unreadCount.update((c) => Math.max(0, c - 1));
    this.api.delete(`/notifications/${n.id}`).subscribe({
      error: (err) => {
        this.items.set(before);
        this.refreshCount();
        onError?.(err);
      },
    });
  }

  refreshCount(): void {
    this.api.get<{ unreadCount: number }>('/notifications/unread-count').subscribe({
      next: (r) => this.unreadCount.set(r.unreadCount ?? 0),
      error: () => undefined,
    });
  }

  private startPolling(): void {
    if (this.poll) return;
    this.poll = timer(0, POLL_MS)
      .pipe(
        filter(() => typeof document === 'undefined' || document.visibilityState !== 'hidden'),
        switchMap(() =>
          this.api.get<{ unreadCount: number }>('/notifications/unread-count').pipe(catchError(() => EMPTY)),
        ),
      )
      .subscribe((r) => this.unreadCount.set(r.unreadCount ?? 0));
  }

  private stopPolling(): void {
    this.poll?.unsubscribe();
    this.poll = undefined;
    this.feed?.unsubscribe();
    this.unreadCount.set(0);
    this.items.set([]);
    this.hasMore.set(false);
    this.isModalOpen.set(false);
  }
}
