import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, filter, switchMap, timer, catchError, EMPTY } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { AppNotification, NotificationMeta } from '../models/api.models';

const PAGE_SIZE = 15;
const POLL_MS = 30_000;

/** Notification centre: unread polling + paginated feed for the bell modal. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly unreadCount = signal(0);
  /** Unread changes to the customer's orders: the badge on the Orders tab. */
  readonly unreadOrders = signal(0);
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
          if (typeof meta.orders === 'number') this.unreadOrders.set(meta.orders);
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
    if (n.order_id || n.link?.startsWith('/app/orders')) this.unreadOrders.update((c) => Math.max(0, c - 1));
    this.api.post<{ unreadCount: number; orders?: number }>(`/notifications/${n.id}/read`).subscribe({
      next: ({ data }) => {
        if (typeof data?.unreadCount === 'number') this.unreadCount.set(data.unreadCount);
        if (typeof data?.orders === 'number') this.unreadOrders.set(data.orders);
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
        this.unreadOrders.set(0);
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

  /** A notification arrived over the websocket: add it to the open list at once and confirm the count with the server. */
  pushLive(n: AppNotification | null | undefined): void {
    if (n?.id) {
      const isNew = !this.items().some((x) => x.id === n.id);
      this.items.update((list) => (isNew ? [n, ...list] : list));
      // foreground: the phone shows no tray notification while the app is open, so tell the customer in the app
      // (once per notification: the live socket event and the push never both raise it)
      if (isNew) this.alertInApp(n);
    }
    this.refreshCount();
  }

  private alertInApp(n: AppNotification): void {
    const link = n.link && n.link.startsWith('/app') ? n.link : null;
    // already looking at that page (an open conversation): no banner on top of it
    if (link && this.router.url.split('?')[0] === link.split('?')[0]) return;
    if (link) this.toast.withAction(n.title, 'Open', () => void this.router.navigateByUrl(link));
    else this.toast.info(n.title);
  }

  refreshCount(): void {
    this.api.get<{ unreadCount: number; orders?: number }>('/notifications/unread-count').subscribe({
      next: (r) => {
        this.unreadCount.set(r.unreadCount ?? 0);
        this.unreadOrders.set(r.orders ?? 0);
      },
      error: () => undefined,
    });
  }

  /** The customer opened the Orders tab: the changes there count as seen. */
  markOrdersRead(): void {
    if (this.unreadOrders() === 0) return;
    const before = this.unreadOrders();
    this.items.update((list) => list.map((x) => (!x.read_at && (x.order_id || x.link?.startsWith('/app/orders')) ? { ...x, read_at: new Date().toISOString() } : x)));
    this.unreadCount.update((c) => Math.max(0, c - before));
    this.unreadOrders.set(0);
    this.api.post<{ unreadCount: number }>('/notifications/read-orders').subscribe({
      next: ({ data }) => typeof data?.unreadCount === 'number' && this.unreadCount.set(data.unreadCount),
      error: () => this.refreshCount(),
    });
  }

  private startPolling(): void {
    if (this.poll) return;
    this.poll = timer(0, POLL_MS)
      .pipe(
        filter(() => typeof document === 'undefined' || document.visibilityState !== 'hidden'),
        switchMap(() =>
          this.api.get<{ unreadCount: number; orders?: number }>('/notifications/unread-count').pipe(catchError(() => EMPTY)),
        ),
      )
      .subscribe((r) => {
        this.unreadCount.set(r.unreadCount ?? 0);
        this.unreadOrders.set(r.orders ?? 0);
      });
  }

  private stopPolling(): void {
    this.poll?.unsubscribe();
    this.poll = undefined;
    this.feed?.unsubscribe();
    this.unreadCount.set(0);
    this.unreadOrders.set(0);
    this.items.set([]);
    this.hasMore.set(false);
    this.isModalOpen.set(false);
  }
}
