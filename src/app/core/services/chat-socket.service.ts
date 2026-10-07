import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { ChatMessage, UserRole } from '../models/api.models';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { SessionRefreshService } from './session-refresh.service';
import { TokenStorage } from './token-storage.service';
import { SendBody } from './chat.service';

export interface ReadEvent {
  orderId: string;
  /** Which chat was opened: an article id, or `general`. Neither = everything. */
  unitId?: string | null;
  general?: boolean;
  readerRole: UserRole;
  readAt: string;
  count: number;
}

export interface TypingEvent {
  orderId: string;
  userId: string;
  name: string | null;
  role: UserRole;
  typing: boolean;
}

export interface OrderUpdateEvent {
  orderId: string;
  status: string;
  status_label: string;
}

interface Ack {
  ok: boolean;
  error?: string;
  status?: number;
}

const ACK_TIMEOUT_MS = 8000;

/** API origin for Socket.IO: the REST base URL without the `/api` suffix. */
export function socketOrigin(apiUrl: string): string {
  return apiUrl.replace(/\/api\/?$/, '');
}

/**
 * One Socket.IO connection for the signed-in customer: live messages, read receipts, typing and bell
 * refreshes. If it cannot connect, `connected` stays false and the chat falls back to REST.
 */
@Injectable({ providedIn: 'root' })
export class ChatSocketService {
  private auth = inject(AuthService);
  private store = inject(TokenStorage);
  private refresher = inject(SessionRefreshService);
  private notif = inject(NotificationService);

  readonly connected = signal(false);

  readonly messageNew$ = new Subject<ChatMessage>();
  readonly messageRead$ = new Subject<ReadEvent>();
  readonly typing$ = new Subject<TypingEvent>();
  /** An order's status changed (e.g. photos sent for approval). */
  readonly orderUpdate$ = new Subject<OrderUpdateEvent>();
  /** Something changed in an order's chats (new message, or read elsewhere): refresh unread counts and the chat list. */
  readonly inboxUpdate$ = new Subject<{ orderId: string }>();
  /** Fires after every (re)connect so open conversations can re-sync what they missed. */
  readonly reconnected$ = new Subject<void>();

  private socket: Socket | null = null;
  /** Reference-counted: the order page and its chat panel both ask for the same room. */
  private rooms = new Map<string, number>();
  private authRetried = false;
  private hadConnection = false;

  constructor() {
    effect(() => {
      const authed = this.auth.isAuthenticated();
      untracked(() => (authed ? this.connect() : this.disconnect()));
    });
  }

  private connect(): void {
    if (this.socket) return;
    const socket = io(socketOrigin(environment.apiUrl), {
      // Function form: the token is re-read on every (re)connect.
      auth: (cb) => cb({ token: this.store.accessToken }),
      reconnectionDelayMax: 10_000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.authRetried = false;
      this.connected.set(true);
      for (const orderId of this.rooms.keys()) this.emitJoin(orderId);
      if (this.hadConnection) this.reconnected$.next();
      this.hadConnection = true;
    });
    socket.on('disconnect', () => this.connected.set(false));
    socket.on('connect_error', (err: Error) => {
      this.connected.set(false);
      if (err.message === 'unauthorized') void this.recoverAuth();
    });

    socket.on('message:new', (m: ChatMessage) => this.messageNew$.next(m));
    socket.on('message:read', (e: ReadEvent) => this.messageRead$.next(e));
    socket.on('typing', (e: TypingEvent) => this.typing$.next(e));
    socket.on('order:update', (e: OrderUpdateEvent) => this.orderUpdate$.next(e));
    socket.on('notification:new', () => this.notif.refreshCount());
    socket.on('inbox:update', (e: { orderId: string }) => {
      this.notif.refreshCount();
      if (e?.orderId) this.inboxUpdate$.next(e);
    });
  }

  private disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.rooms.clear();
    this.connected.set(false);
    this.hadConnection = false;
    this.authRetried = false;
  }

  /** Expired access token: refresh once and reconnect (socket.io does not retry middleware rejections). */
  private async recoverAuth(): Promise<void> {
    if (this.authRetried || !this.socket) return;
    this.authRetried = true;
    try {
      await firstValueFrom(this.refresher.refresh());
      this.socket?.connect();
    } catch {
      this.auth.handleSessionExpired();
    }
  }

  // ───────── rooms ─────────

  /** Start receiving events for an order. Re-joined automatically after a reconnect. */
  join(orderId: string): void {
    const n = this.rooms.get(orderId) ?? 0;
    this.rooms.set(orderId, n + 1);
    if (n === 0 && this.socket?.connected) this.emitJoin(orderId);
  }

  leave(orderId: string): void {
    const n = this.rooms.get(orderId) ?? 0;
    if (n > 1) {
      this.rooms.set(orderId, n - 1);
      return;
    }
    this.rooms.delete(orderId);
    if (this.socket?.connected) this.socket.emit('conversation:leave', { orderId });
  }

  private emitJoin(orderId: string): void {
    this.socket?.timeout(ACK_TIMEOUT_MS).emit('conversation:join', { orderId }, (err: Error | null, ack?: Ack) => {
      if (err || !ack?.ok) console.warn('[chat] could not join conversation', orderId, err?.message ?? ack?.error);
    });
  }

  // ───────── actions ─────────

  /** Send over the socket; rejects when offline or not acknowledged (the caller then uses REST). */
  send(orderId: string, body: SendBody): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket?.connected) return reject(new Error('offline'));
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit('message:send', { orderId, ...body }, (err: Error | null, ack?: Ack & { message?: ChatMessage }) => {
          if (err) return reject(err);
          if (ack?.ok && ack.message) return resolve(ack.message);
          reject(Object.assign(new Error(ack?.error || 'Message was not accepted.'), { status: ack?.status }));
        });
    });
  }

  markRead(orderId: string, unitId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket?.connected) return reject(new Error('offline'));
      socket.timeout(ACK_TIMEOUT_MS).emit('message:read', { orderId, ...(unitId ? { unit_id: unitId } : {}) }, (err: Error | null, ack?: Ack) => (err || !ack?.ok ? reject(err ?? new Error(ack?.error)) : resolve()));
    });
  }

  typing(orderId: string, typing: boolean): void {
    if (this.socket?.connected) this.socket.volatile.emit('typing', { orderId, typing });
  }
}
