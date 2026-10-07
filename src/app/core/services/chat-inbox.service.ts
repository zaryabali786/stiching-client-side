import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subject, bufferTime, catchError, filter, interval, map, of, switchMap } from 'rxjs';
import { ConversationScope, OrderConversation, UserRole } from '../models/api.models';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import { ChatSocketService } from './chat-socket.service';

const FALLBACK_POLL_MS = 60_000;

interface OrderRef {
  id: string;
  reference: string;
  brand: string;
}

/** One order that has conversations, summarised for the app-wide chat list. */
export interface InboxChat {
  orderId: string;
  reference: string;
  brand: string;
  scopes: ConversationScope[];
  /** Unread messages in the order's General chat (what the floating button counts). */
  generalUnread: number;
  /** Unread messages in the article chats of the same order. */
  otherUnread: number;
  lastAt: string | null;
  /** Last message, prefixed with the article name when it was in an article chat. */
  preview: string | null;
  previewRole: UserRole | null;
}

function summarise(order: OrderRef, scopes: ConversationScope[]): InboxChat | null {
  const withMessages = scopes.filter((s) => s.last_message_at);
  if (!withMessages.length) return null;
  const last = withMessages.reduce((a, b) => ((a.last_message_at ?? '') >= (b.last_message_at ?? '') ? a : b));
  const body = last.last_message_preview || 'Message';
  return {
    orderId: order.id,
    reference: order.reference,
    brand: order.brand,
    scopes,
    generalUnread: scopes.find((s) => !s.unit_id)?.unread ?? 0,
    otherUnread: scopes.filter((s) => s.unit_id).reduce((n, s) => n + s.unread, 0),
    lastAt: last.last_message_at,
    preview: last.unit_id ? `${last.title}: ${body}` : body,
    previewRole: last.last_message_role,
  };
}

/**
 * The customer's orders that have conversations, for the app-wide chat button. One call (`/client/conversations`) loads
 * them all; it stays fresh from the socket's `inbox:update` (sent to the customer's user room, no order room needed).
 */
@Injectable({ providedIn: 'root' })
export class ChatInboxService {
  private auth = inject(AuthService);
  private chat = inject(ChatService);
  private socket = inject(ChatSocketService);

  readonly items = signal<InboxChat[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  /** Unread messages in General chats, over all orders. */
  readonly totalUnread = computed(() => this.items().reduce((n, c) => n + c.generalUnread, 0));

  private known = new Map<string, OrderRef>();
  private reload$ = new Subject<boolean>();

  constructor() {
    this.reload$
      .pipe(
        switchMap((quiet) => {
          if (!quiet || !this.loaded()) this.loading.set(true);
          this.error.set(null);
          return this.chat.mine().pipe(
            map((rows) => ({ items: this.summariseAll(rows), error: '' })),
            catchError((err: Error) => of({ items: null, error: err.message })),
          );
        }),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (res.items) {
          this.items.set(this.sorted(res.items));
          this.loaded.set(true);
        } else if (!this.loaded()) {
          this.error.set(res.error || 'Could not load your chats.');
        }
      });

    effect(() => {
      const authed = this.auth.isAuthenticated();
      untracked(() => {
        if (authed) this.reload();
        else this.reset();
      });
    });

    // A message or a read anywhere: re-read just that order's chats.
    this.socket.inboxUpdate$
      .pipe(
        bufferTime(400),
        filter((list) => list.length > 0),
      )
      .subscribe((list) => {
        if (!this.auth.isAuthenticated()) return;
        const ids = [...new Set(list.map((e) => e.orderId))];
        if (ids.some((id) => !this.known.has(id))) return this.reload(true);
        ids.forEach((id) => this.refreshOrder(id));
      });
    this.socket.reconnected$.subscribe(() => this.auth.isAuthenticated() && this.reload(true));
    // Without a socket, check now and then so replies still show up.
    interval(FALLBACK_POLL_MS)
      .pipe(filter(() => this.auth.isAuthenticated() && !this.socket.connected() && document.visibilityState === 'visible'))
      .subscribe(() => this.reload(true));
  }

  /** (Re)read the list. `quiet` keeps what is on screen while it loads. */
  reload(quiet = false): void {
    this.reload$.next(quiet);
  }

  /** Re-read one order's chats (after reading it, or when its inbox row changed). */
  refreshOrder(orderId: string): void {
    const order = this.known.get(orderId);
    if (!order) return this.reload(true);
    this.chat
      .scopes(orderId)
      .pipe(catchError(() => of(null)))
      .subscribe((c) => {
        if (!c) return;
        const next = summarise(order, c.scopes);
        const rest = this.items().filter((x) => x.orderId !== orderId);
        this.items.set(this.sorted(next ? [...rest, next] : rest));
      });
  }

  generalUnreadOf(orderId: string): number {
    return this.items().find((c) => c.orderId === orderId)?.generalUnread ?? 0;
  }

  private summariseAll(rows: OrderConversation[]): InboxChat[] {
    this.known = new Map(rows.map((o) => [o.id, { id: o.id, reference: o.reference, brand: o.brand }]));
    return rows.map((o) => summarise(this.known.get(o.id)!, o.scopes)).filter((x): x is InboxChat => !!x);
  }

  private sorted(list: InboxChat[]): InboxChat[] {
    return [...list].sort((a, b) => ((a.lastAt ?? '') < (b.lastAt ?? '') ? 1 : -1));
  }

  private reset(): void {
    this.items.set([]);
    this.known.clear();
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
  }
}
