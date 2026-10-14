import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ChatSocketService } from './chat-socket.service';

export interface SupportMessage {
  id: string;
  customer_id: string;
  sender_role: 'customer' | 'admin';
  body: string;
  client_msg_id?: string | null;
  read_at: string | null;
  created_at: string;
  /** Only on messages sent from this screen that the server has not confirmed yet. */
  status?: 'sending' | 'failed';
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The customer's general chat with the admin team (not about any order). Text only. Live through the shared socket;
 * `unread` is what the team wrote and the customer has not opened yet.
 */
@Injectable({ providedIn: 'root' })
export class SupportChatService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private socket = inject(ChatSocketService);

  readonly messages = signal<SupportMessage[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);
  /** The chat sheet is open: new team messages are read at once. */
  readonly viewing = signal(false);
  private loaded = false;

  constructor() {
    effect(() => {
      const authed = this.auth.isAuthenticated();
      untracked(() => {
        if (authed) this.refreshUnread();
        else this.reset();
      });
    });
    this.socket.supportNew$.subscribe((m) => {
      this.messages.update((list) => {
        if (list.some((x) => x.id === m.id)) return list;
        // replace the optimistic copy of my own message
        const mine = m.client_msg_id ? list.findIndex((x) => x.client_msg_id === m.client_msg_id) : -1;
        if (mine >= 0) return list.map((x, i) => (i === mine ? m : x));
        return [...list, m];
      });
      if (m.sender_role === 'admin') {
        if (this.viewing()) this.markRead();
        else this.unread.update((n) => n + 1);
      }
    });
    this.socket.supportRead$.subscribe((e) => {
      if (e.readerRole !== 'admin') return;
      this.messages.update((list) => list.map((m) => (m.sender_role === 'customer' && !m.read_at ? { ...m, read_at: e.readAt } : m)));
    });
    this.socket.reconnected$.subscribe(() => {
      this.refreshUnread();
      if (this.loaded) this.load(true);
    });
  }

  private reset(): void {
    this.messages.set([]);
    this.unread.set(0);
    this.loaded = false;
    this.viewing.set(false);
  }

  refreshUnread(): void {
    this.api.get<{ unread: number }>('/client/support/unread').subscribe({ next: (r) => this.unread.set(r.unread), error: () => undefined });
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.error.set(null);
    this.api.get<{ messages: SupportMessage[]; hasMore: boolean }>('/client/support/messages', { limit: 50 }).subscribe({
      next: (r) => {
        this.messages.set(r.messages);
        this.hasMore.set(r.hasMore);
        this.loading.set(false);
        this.loaded = true;
        if (this.viewing()) this.markRead();
      },
      error: (err: Error) => {
        this.loading.set(false);
        if (!silent) this.error.set(err.message);
      },
    });
  }

  loadOlder(): void {
    const first = this.messages()[0];
    if (!first || !this.hasMore()) return;
    this.api.get<{ messages: SupportMessage[]; hasMore: boolean }>('/client/support/messages', { limit: 50, before: first.created_at }).subscribe({
      next: (r) => {
        this.messages.update((list) => [...r.messages, ...list]);
        this.hasMore.set(r.hasMore);
      },
    });
  }

  /** The sheet opened or closed. */
  setViewing(on: boolean): void {
    this.viewing.set(on);
    if (on) {
      if (!this.loaded) this.load();
      else this.load(true);
      this.markRead();
    }
  }

  markRead(): void {
    if (this.unread() === 0 && !this.messages().some((m) => m.sender_role === 'admin' && !m.read_at)) return;
    this.unread.set(0);
    this.api.post<{ updated: number }>('/client/support/read', {}).subscribe({ error: () => undefined });
  }

  send(text: string, retry?: SupportMessage): void {
    const body = text.trim();
    if (!body) return;
    const clientMsgId = retry?.client_msg_id ?? uuid();
    const optimistic: SupportMessage = {
      id: retry?.id ?? `tmp-${clientMsgId}`,
      customer_id: this.auth.user()?.id ?? '',
      sender_role: 'customer',
      body,
      client_msg_id: clientMsgId,
      read_at: null,
      created_at: retry?.created_at ?? new Date().toISOString(),
      status: 'sending',
    };
    this.messages.update((list) => (retry ? list.map((m) => (m.id === retry.id ? optimistic : m)) : [...list, optimistic]));
    this.api.post<{ message: SupportMessage }>('/client/support/messages', { body, client_msg_id: clientMsgId }).subscribe({
      next: ({ data }) => this.messages.update((list) => {
        const saved = data.message;
        const withoutDup = list.filter((m) => m.id !== saved.id || m.client_msg_id === clientMsgId);
        return withoutDup.map((m) => (m.client_msg_id === clientMsgId ? saved : m));
      }),
      error: () => this.messages.update((list) => list.map((m) => (m.client_msg_id === clientMsgId ? { ...m, status: 'failed' } : m))),
    });
  }
}
