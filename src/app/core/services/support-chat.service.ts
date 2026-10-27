import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ChatSocketService } from './chat-socket.service';

/** A voice message as the server shows it: a link that plays it (valid for an hour). */
export interface SupportAudio {
  mime: string;
  duration: number | null;
  size: number | null;
  url: string;
}

/** What the server needs to attach an uploaded recording to a message. */
interface UploadedVoice {
  path: string;
  duration: number;
  mime: string;
  size: number | null;
}

export interface SupportMessage {
  id: string;
  customer_id: string;
  sender_role: 'customer' | 'admin';
  kind?: 'text' | 'voice';
  body: string | null;
  audio?: SupportAudio | null;
  client_msg_id?: string | null;
  read_at: string | null;
  created_at: string;
  /** Only on messages sent from this screen that the server has not confirmed yet. */
  status?: 'sending' | 'failed';
  /** The recording of a voice message that is still being sent (kept so a retry can upload it), and its upload once done. */
  pending?: { dataUrl: string; duration: number };
  uploaded?: UploadedVoice;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The customer's general chat with the admin team (not about any order). Text and voice. Live through the shared socket;
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

  /** Send a text message (optimistic: it shows at once and turns into the saved one when the server answers). */
  send(text: string): void {
    const body = text.trim();
    if (!body) return;
    const cid = uuid();
    this.messages.update((list) => [...list, this.local(cid, { kind: 'text', body })]);
    this.deliver(cid);
  }

  /** Send a recording: it shows at once with its own audio, is uploaded, then attached to a message. */
  sendVoice(rec: { dataUrl: string; duration: number; mime: string; blob: Blob }): void {
    const cid = uuid();
    this.messages.update((list) => [
      ...list,
      this.local(cid, { kind: 'voice', body: null, audio: { mime: rec.mime, duration: rec.duration, size: rec.blob.size, url: rec.dataUrl }, pending: { dataUrl: rec.dataUrl, duration: rec.duration } }),
    ]);
    this.deliver(cid);
  }

  /** Try a message that failed again (same client_msg_id, so it never arrives twice). */
  retry(m: SupportMessage): void {
    if (!m.client_msg_id) return;
    this.patch(m.client_msg_id, { status: 'sending' });
    this.deliver(m.client_msg_id);
  }

  private local(cid: string, part: Partial<SupportMessage>): SupportMessage {
    return { id: `tmp-${cid}`, customer_id: this.auth.user()?.id ?? '', sender_role: 'customer', kind: 'text', body: null, client_msg_id: cid, read_at: null, created_at: new Date().toISOString(), status: 'sending', ...part };
  }

  private patch(cid: string, patch: Partial<SupportMessage>): void {
    this.messages.update((list) => list.map((m) => (m.client_msg_id === cid ? { ...m, ...patch } : m)));
  }

  private deliver(cid: string): void {
    const msg = this.messages().find((m) => m.client_msg_id === cid);
    if (!msg) return;
    const fail = () => this.patch(cid, { status: 'failed' });
    const post = (body: object) =>
      this.api.post<{ message: SupportMessage }>('/client/support/messages', { ...body, client_msg_id: cid }).subscribe({
        next: ({ data }) => this.messages.update((list) => {
          const saved = data.message;
          const withoutDup = list.filter((m) => m.id !== saved.id || m.client_msg_id === cid);
          return withoutDup.map((m) => (m.client_msg_id === cid ? saved : m));
        }),
        error: fail,
      });

    if (msg.kind !== 'voice') {
      post({ body: msg.body });
      return;
    }
    if (msg.uploaded) {
      post({ kind: 'voice', audio: msg.uploaded });
      return;
    }
    const pending = msg.pending;
    if (!pending) {
      fail();
      return;
    }
    this.api.post<UploadedVoice & { url: string }>('/client/support/voice-upload', { audio: { dataUrl: pending.dataUrl, duration: pending.duration } }).subscribe({
      next: ({ data }) => {
        const uploaded: UploadedVoice = { path: data.path, duration: data.duration, mime: data.mime, size: data.size };
        this.patch(cid, { uploaded });
        post({ kind: 'voice', audio: uploaded });
      },
      error: fail,
    });
  }
}
