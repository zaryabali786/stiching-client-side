import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ApiResult, ChatMessage } from '../core/models/api.models';
import { ChatService, SendBody, VoicePayload } from '../core/services/chat.service';
import { ChatSocketService } from '../core/services/chat-socket.service';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { ToastService } from '../core/services/toast.service';
import { errorMessage } from '../core/services/api.service';
import { ErrorStateComponent, SkeletonComponent } from './ui-states';
import { VoicePlayerComponent } from './voice-player.component';
import { VoiceRecorderComponent, VoiceRecording } from './voice-recorder.component';

const MAX_LENGTH = 4000;
const NEAR_BOTTOM_PX = 90;
const STAFF_TEAM = 'Ishaal Stitching team';
const POLL_MS = 15_000;

type SendStatus = 'sending' | 'sent' | 'failed';

interface UiMessage extends ChatMessage {
  /** Only set on messages sent from this screen that the server has not confirmed yet. */
  status?: SendStatus;
  /** Voice upload result, kept so a retry does not upload the audio twice. */
  uploaded?: VoicePayload;
  /** Raw recording of a pending voice message (needed for upload / retry). */
  pending?: { dataUrl: string; duration: number };
}

type Row = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: UiMessage; mine: boolean; showSender: boolean };

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: diff > 300 ? 'numeric' : undefined });
}

/** Real-time conversation for one order: text + voice, optimistic sends, REST fallback when the socket is down. */
@Component({
  selector: 'app-chat-panel',
  imports: [DatePipe, IonIcon, IonSpinner, SkeletonComponent, ErrorStateComponent, VoicePlayerComponent, VoiceRecorderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.fill]': 'fill()' },
  template: `
    <div class="chat" #root [class.fill]="fill()">
      @if (!socket.connected()) {
        <div class="chat-banner" role="status">
          <ion-icon name="cloud-offline-outline" aria-hidden="true"></ion-icon>
          <span>Live updates are paused — reconnecting. You can still send messages.</span>
        </div>
      }

      <div class="chat-scroll" #scroller role="log" aria-label="Messages" aria-relevant="additions" tabindex="0" (scroll)="onScroll()">
        @if (loading()) {
          <app-skeleton variant="tiles" [count]="2" />
        } @else if (loadError() && !messages().length) {
          <app-error-state title="Messages didn't load" [message]="loadError()!" (retry)="reload()" />
        } @else {
          @if (hasOlder()) {
            <div class="older">
              <button type="button" class="link-btn" (click)="loadOlder()" [disabled]="loadingOlder()">
                @if (loadingOlder()) {
                  <ion-spinner name="crescent"></ion-spinner> Loading…
                } @else {
                  Load earlier messages
                }
              </button>
            </div>
          }
          @if (!messages().length) {
            <p class="chat-empty">No messages yet. Ask us anything about this order and we'll reply here.</p>
          }
          @for (row of rows(); track row.key) {
            @if (row.kind === 'day') {
              <div class="day"><span>{{ row.label }}</span></div>
            } @else {
              <div class="msg" [class.mine]="row.mine">
                @if (row.showSender) {
                  <span class="sender">{{ row.m.sender_name || 'Our team' }} <span class="role">· {{ teamLabel }}</span></span>
                }
                <div class="bubble" [class.failed]="row.m.status === 'failed'" [class.voice]="row.m.kind === 'voice'">
                  @if (row.m.kind === 'voice' && row.m.audio) {
                    <app-voice-player [src]="row.m.audio.url" [duration]="row.m.audio.duration" [mime]="row.m.audio.mime" (loadFailed)="onAudioFailed()" />
                  } @else {
                    <p class="text">{{ row.m.body }}</p>
                  }
                </div>
                <div class="meta">
                  @if (row.m.status === 'sending') {
                    <span>Sending…</span>
                  } @else if (row.m.status === 'failed') {
                    <span class="bad">Not sent</span>
                    <button type="button" class="link-btn retry" (click)="retrySend(row.m)">Retry</button>
                  } @else {
                    <time [attr.datetime]="row.m.created_at">{{ row.m.created_at | date: 'HH:mm' }}</time>
                    @if (row.mine && row.m.id === lastMineId() && row.m.read_at) {
                      <span class="seen"><ion-icon name="checkmark-done-outline" aria-hidden="true"></ion-icon> Seen</span>
                    }
                  }
                </div>
              </div>
            }
          }
          @if (typingName(); as who) {
            <div class="typing" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> {{ who }} is typing…</div>
          }
        }
      </div>

      <div class="composer-wrap">
        @if (voiceError()) {
          <div class="voice-err" role="alert">
            <span class="field-error">{{ voiceError() }}</span>
            @if (voiceSilent()) {
              <button type="button" class="btn btn-outline btn-sm" (click)="rec.start()">Record again</button>
            }
          </div>
        }
        @if (draft().length > 3500) {
          <span class="count" [class.over]="draft().length >= maxLength" aria-live="polite">{{ draft().length }} / {{ maxLength }}</span>
        }
        <div class="composer" [class.recording]="recording()">
          @if (!recording()) {
            <textarea
              #composer
              class="textarea"
              rows="1"
              aria-label="Write a message"
              placeholder="Write a message…"
              [attr.maxlength]="maxLength"
              [value]="draft()"
              (input)="onDraft($event)"
              (keydown)="onKey($event)"
              (blur)="stopTyping()"
            ></textarea>
          }
          <app-voice-recorder #rec variant="icon" label="Record a voice message" sendLabel="Send voice message" [showError]="false" (recorded)="sendVoice($event)" (recordingChange)="onRecordingChange($event)" (errorChange)="voiceError.set($event)" (silentChange)="voiceSilent.set($event)" />
          @if (!recording()) {
            <button type="button" class="send" (click)="send()" [disabled]="!canSend()" aria-label="Send message">
              <ion-icon name="send" aria-hidden="true"></ion-icon>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    :host(.fill) { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .chat { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .chat.fill { flex: 1; min-height: 0; }
    /* Inside the chat sheet the message list takes the free height and the composer stays pinned at the bottom. */
    .chat.fill .chat-scroll { flex: 1; min-height: 0; max-height: none; }
    .chat-banner {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px;
      background: var(--t-amber-bg); box-shadow: inset 0 0 0 1px var(--t-amber-line); color: var(--t-amber-fg);
      font-size: var(--fs-sm); line-height: 1.35;
    }
    .chat-banner ion-icon { flex: none; font-size: 18px; }
    .chat-scroll {
      display: flex; flex-direction: column; gap: 6px; min-height: 120px; max-height: clamp(180px, 38vh, 340px); overflow-y: auto;
      overscroll-behavior: contain; padding: 4px 8px 4px 2px; border-radius: 12px;
    }
    .chat-scroll:focus-visible { outline: 2px solid var(--c-focus); outline-offset: 2px; }
    .older { display: flex; justify-content: center; }
    .older .link-btn { min-height: 44px; align-self: center; }
    .older ion-spinner { width: 16px; height: 16px; }
    .chat-empty { margin: auto 0; padding: 18px 12px; text-align: center; color: var(--c-muted); font-size: var(--fs-md); line-height: 1.5; }
    .day { display: flex; justify-content: center; margin: 8px 0 2px; }
    .day span {
      padding: 2px 10px; border-radius: 999px; background: var(--c-surface-3); color: var(--c-muted);
      font-size: var(--fs-xs); font-weight: 600;
    }
    .msg { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; max-width: 86%; }
    .msg.mine { align-self: flex-end; align-items: flex-end; }
    .sender { font-size: var(--fs-xs); font-weight: 600; color: var(--c-ink-2); margin: 6px 4px 0; }
    .role { font-weight: 500; color: var(--c-gold-dark); }
    .bubble {
      padding: 9px 13px; border-radius: 16px 16px 16px 5px; background: var(--c-surface); border: 1px solid var(--c-line);
      color: var(--c-ink); font-size: var(--fs-body); line-height: 1.4; min-width: 0; max-width: 100%;
    }
    .mine .bubble { border-radius: 16px 16px 5px 16px; background: var(--c-brand-soft); border-color: var(--t-green-line); }
    .bubble.voice { padding: 4px 8px 4px 4px; }
    .bubble.failed { border-color: var(--t-red-line); background: var(--t-red-bg); }
    .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .meta { display: flex; align-items: center; gap: 8px; margin: 0 4px; font-size: var(--fs-xs); color: var(--c-muted); }
    .meta .bad { color: var(--t-red-fg); font-weight: 600; }
    .meta .retry { min-height: 32px; font-size: var(--fs-xs); }
    .seen { display: inline-flex; align-items: center; gap: 3px; color: var(--t-green-fg); font-weight: 600; }
    .seen ion-icon { font-size: 15px; }
    .typing { display: flex; align-items: center; gap: 8px; padding: 2px 6px; color: var(--c-muted); font-size: var(--fs-sm); }
    .dots { display: inline-flex; gap: 3px; }
    .dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--c-muted); animation: chat-dot 1.2s infinite ease-in-out; }
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .dots i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes chat-dot { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }

    .composer-wrap { flex: none; display: flex; flex-direction: column; gap: 6px; }
    .chat.fill .composer-wrap {
      margin: 0 -18px; padding: 8px 18px calc(10px + env(safe-area-inset-bottom, 0px));
      background: var(--c-bg); border-top: 1px solid var(--c-line-soft);
    }
    .voice-err { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .composer { display: flex; align-items: flex-end; gap: 8px; }
    .composer .textarea { flex: 1; min-width: 0; min-height: 48px; max-height: 120px; resize: none; padding: 12px 14px; border-radius: 24px; }
    .composer app-voice-recorder { flex: none; align-self: flex-end; margin-bottom: 2px; }
    .composer.recording { align-items: center; }
    .composer.recording app-voice-recorder { flex: 1; align-self: center; margin-bottom: 0; }
    .send {
      flex: none; width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer;
      background: var(--c-brand); color: #fff; font-size: 20px; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 14px rgba(15, 57, 43, 0.22);
    }
    .send:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
    .count { align-self: flex-end; font-size: var(--fs-xs); color: var(--c-muted); }
    .count.over { color: var(--t-red-fg); font-weight: 600; }
  `,
})
export class ChatPanelComponent implements OnInit, OnDestroy {
  readonly orderId = input.required<string>();
  /** Which chat: an article's uuid, or `general` (the order's own chat). */
  readonly unitId = input<string>('general');
  /** Fill the available height (inside the chat sheet) instead of a fixed-height scroller. */
  readonly fill = input(false);
  /** The open chat was marked read (the parent refreshes its unread badges). */
  readonly read = output<void>();

  protected socket = inject(ChatSocketService);
  private chat = inject(ChatService);
  private auth = inject(AuthService);
  private notif = inject(NotificationService);
  private toast = inject(ToastService);
  private injector = inject(Injector);
  private destroyRef = inject(DestroyRef);

  private root = viewChild.required<ElementRef<HTMLElement>>('root');
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  protected readonly maxLength = MAX_LENGTH;
  protected readonly teamLabel = STAFF_TEAM;
  protected messages = signal<UiMessage[]>([]);
  protected loading = signal(true);
  protected loadError = signal<string | null>(null);
  protected hasOlder = signal(false);
  protected loadingOlder = signal(false);
  protected draft = signal('');
  protected recording = signal(false);
  protected voiceError = signal<string | null>(null);
  protected voiceSilent = signal(false);
  protected typingName = signal<string | null>(null);

  private cursor: string | null = null;
  private visible = signal(false);
  private marking = false;
  private lastRefresh = 0;
  private typingSent = false;
  private typingTimer?: ReturnType<typeof setTimeout>;
  private otherTypingTimer?: ReturnType<typeof setTimeout>;
  private joined: string | null = null;

  private me = computed(() => this.auth.user()?.id ?? '');
  protected canSend = computed(() => this.draft().trim().length > 0 && this.draft().length <= MAX_LENGTH);
  private isMine = (m: ChatMessage) => m.sender_id === this.me();

  protected lastMineId = computed(() => {
    const mine = this.messages().filter((m) => this.isMine(m) && !m.status);
    return mine.at(-1)?.id ?? null;
  });

  protected rows = computed<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = '';
    let lastSender = '';
    for (const m of this.messages()) {
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) {
        out.push({ kind: 'day', key: `day-${day}`, label: dayLabel(m.created_at) });
        lastDay = day;
        lastSender = '';
      }
      const mine = this.isMine(m);
      out.push({ kind: 'msg', key: m.client_msg_id || m.id, m, mine, showSender: !mine && m.sender_id !== lastSender });
      lastSender = m.sender_id;
    }
    return out;
  });

  constructor() {
    // Join the room of whichever order is shown (and leave the previous one).
    effect(() => {
      const id = this.orderId();
      untracked(() => {
        if (this.joined && this.joined !== id) this.socket.leave(this.joined);
        if (this.joined !== id) this.socket.join(id);
        this.joined = id;
      });
    });
    // Another order or another chat (General / article): start that thread from scratch.
    effect(() => {
      this.orderId();
      this.unitId();
      untracked(() => {
        this.messages.set([]);
        this.cursor = null;
        this.hasOlder.set(false);
        this.typingName.set(null);
        this.reload();
      });
    });

    // Tell the other side we read their messages whenever the panel is on screen.
    effect(() => {
      this.messages();
      if (this.visible()) untracked(() => this.markReadIfNeeded());
    });
  }

  ngOnInit(): void {
    const s = this.socket;
    s.messageNew$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((m) => {
      if (m.order_id !== this.orderId() || this.scopeOf(m) !== this.unitId()) return;
      const stick = this.nearBottom() || m.sender_id === this.me();
      this.upsert([m]);
      if (stick) this.scrollToBottom();
    });
    s.messageRead$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      if (e.orderId !== this.orderId() || e.readerRole === 'customer') return;
      // Only the chat that was opened on the other side; no scope in the event means everything.
      const unit = e.unitId ?? (e.general ? 'general' : null);
      if (unit && unit !== this.unitId()) return;
      this.messages.update((list) => list.map((m) => (this.isMine(m) && !m.read_at ? { ...m, read_at: e.readAt } : m)));
    });
    s.typing$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      if (e.orderId !== this.orderId() || e.userId === this.me()) return;
      clearTimeout(this.otherTypingTimer);
      this.typingName.set(e.typing ? e.name || 'Our team' : null);
      if (e.typing) this.otherTypingTimer = setTimeout(() => this.typingName.set(null), 5000);
    });
    // Catch up on anything missed while the socket was down.
    s.reconnected$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.sync());

    // Without a socket, poll quietly so replies still show up.
    const poll = setInterval(() => {
      if (!s.connected() && document.visibilityState === 'visible') this.sync();
    }, POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(poll));

    afterNextRender(
      () => {
        if (typeof IntersectionObserver === 'undefined') return this.visible.set(true);
        const io = new IntersectionObserver((entries) => this.visible.set(entries.some((e) => e.isIntersecting)), { threshold: 0.15 });
        io.observe(this.root().nativeElement);
        this.destroyRef.onDestroy(() => io.disconnect());
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    if (this.joined) this.socket.leave(this.joined);
    clearTimeout(this.typingTimer);
    clearTimeout(this.otherTypingTimer);
    if (this.typingSent && this.joined) this.socket.typing(this.joined, false);
  }

  /** Put the cursor in the message box (used when arriving from a notification). */
  focusComposer(): void {
    this.composer()?.nativeElement.focus({ preventScroll: true });
  }

  // ───────── loading ─────────

  protected reload(): void {
    this.loading.set(this.messages().length === 0);
    this.loadError.set(null);
    const key = this.orderId() + '|' + this.unitId();
    this.chat
      .history(this.orderId(), { unitId: this.unitId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items, meta }) => {
          if (key !== this.orderId() + '|' + this.unitId()) return; // the reader moved to another chat meanwhile
          this.upsert(items);
          this.cursor = meta.nextCursor ?? null;
          this.hasOlder.set(!!meta.hasMore);
          this.loading.set(false);
          this.scrollToBottom();
        },
        error: (err: Error) => {
          this.loadError.set(err.message);
          this.loading.set(false);
        },
      });
  }

  /** Quiet refresh of the latest page (reconnect, polling, expired audio links). */
  private sync(): void {
    this.lastRefresh = Date.now();
    const key = this.orderId() + '|' + this.unitId();
    this.chat
      .history(this.orderId(), { unitId: this.unitId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => {
          if (key !== this.orderId() + '|' + this.unitId()) return;
          const stick = this.nearBottom();
          this.upsert(items);
          if (stick) this.scrollToBottom();
        },
        error: () => undefined,
      });
  }

  protected loadOlder(): void {
    if (this.loadingOlder() || !this.hasOlder() || !this.cursor) return;
    this.loadingOlder.set(true);
    const el = this.scroller()?.nativeElement;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    const key = this.orderId() + '|' + this.unitId();
    this.chat
      .history(this.orderId(), { before: this.cursor, unitId: this.unitId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items, meta }) => {
          if (key !== this.orderId() + '|' + this.unitId()) return;
          this.upsert(items);
          this.cursor = meta.nextCursor ?? null;
          this.hasOlder.set(!!meta.hasMore);
          this.loadingOlder.set(false);
          // Keep what the reader was looking at in place.
          afterNextRender(() => {
            if (el) el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
          }, { injector: this.injector });
        },
        error: (err) => {
          this.loadingOlder.set(false);
          this.toast.error(err);
        },
      });
  }

  /** Voice links are signed for an hour: reload the latest page once in a while to get fresh ones. */
  protected onAudioFailed(): void {
    if (Date.now() - this.lastRefresh > 20_000) this.sync();
  }

  protected onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (el && el.scrollTop < 40 && this.hasOlder() && !this.loadingOlder() && !this.loading()) this.loadOlder();
  }

  /** Insert or replace by id / client_msg_id, oldest first. */
  private upsert(incoming: ChatMessage[]): void {
    this.messages.update((cur) => {
      const next = [...cur];
      for (const m of incoming) {
        const i = next.findIndex((x) => x.id === m.id || (!!m.client_msg_id && x.client_msg_id === m.client_msg_id));
        if (i >= 0) next[i] = { ...m };
        else next.push({ ...m });
      }
      return next.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    });
  }

  // ───────── read receipts ─────────

  /** `general` or the article id of a message. */
  private scopeOf(m: ChatMessage): string {
    return m.unit_id ?? 'general';
  }

  private markReadIfNeeded(): void {
    if (this.marking || document.visibilityState !== 'visible') return;
    const id = this.orderId();
    const unit = this.unitId();
    if (!this.messages().some((m) => !this.isMine(m) && !m.read_at && !m.status)) return;
    this.marking = true;
    const done = () => {
      this.marking = false;
      const now = new Date().toISOString();
      this.messages.update((list) => list.map((m) => (!this.isMine(m) && !m.read_at ? { ...m, read_at: now } : m)));
      this.notif.refreshCount();
      this.read.emit();
    };
    this.socket
      .markRead(id, unit)
      .then(done)
      .catch(() =>
        firstValueFrom(this.chat.markRead(id, unit))
          .then(done)
          .catch(() => (this.marking = false)),
      );
  }

  // ───────── composing ─────────

  protected onDraft(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    this.autosize(el);
    if (el.value.trim()) this.pingTyping();
    else this.stopTyping();
  }

  protected onKey(event: KeyboardEvent): void {
    // Enter sends with a physical keyboard; on phones it inserts a new line (use the send button).
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      event.preventDefault();
      this.send();
    }
  }

  private autosize(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  private pingTyping(): void {
    const id = this.orderId();
    if (!this.typingSent) {
      this.typingSent = true;
      this.socket.typing(id, true);
    }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), 2500);
  }

  protected stopTyping(): void {
    clearTimeout(this.typingTimer);
    if (this.typingSent) {
      this.typingSent = false;
      this.socket.typing(this.orderId(), false);
    }
  }

  // ───────── sending ─────────

  private localBase(kind: 'text' | 'voice', cid: string): UiMessage {
    return {
      id: `local-${cid}`,
      order_id: this.orderId(),
      sender_id: this.me(),
      sender_role: 'customer',
      sender_name: this.auth.user()?.full_name ?? null,
      kind,
      body: null,
      audio: null,
      client_msg_id: cid,
      unit_id: this.unitId() === 'general' ? null : this.unitId(),
      read_at: null,
      created_at: new Date().toISOString(),
      status: 'sending',
    };
  }

  protected send(): void {
    const body = this.draft().trim();
    if (!body || body.length > MAX_LENGTH) return;
    const cid = uuid();
    this.messages.update((l) => [...l, { ...this.localBase('text', cid), body }]);
    this.draft.set('');
    this.stopTyping();
    const box = this.composer()?.nativeElement;
    if (box) {
      box.value = '';
      box.style.height = 'auto';
    }
    this.scrollToBottom();
    void this.deliver(cid);
  }

  protected onRecordingChange(on: boolean): void {
    this.recording.set(on);
    if (on) this.stopTyping();
  }

  protected sendVoice(rec: VoiceRecording): void {
    this.voiceError.set(null);
    const cid = uuid();
    this.messages.update((l) => [
      ...l,
      {
        ...this.localBase('voice', cid),
        audio: { mime: rec.mime, duration: rec.duration, size: rec.blob.size, url: rec.dataUrl },
        pending: { dataUrl: rec.dataUrl, duration: rec.duration },
      },
    ]);
    this.scrollToBottom();
    void this.deliver(cid);
  }

  protected retrySend(m: UiMessage): void {
    if (!m.client_msg_id) return;
    this.patchLocal(m.client_msg_id, { status: 'sending' });
    void this.deliver(m.client_msg_id);
  }

  private patchLocal(cid: string, patch: Partial<UiMessage>): void {
    this.messages.update((l) => l.map((m) => (m.client_msg_id === cid ? { ...m, ...patch } : m)));
  }

  private find(cid: string): UiMessage | undefined {
    return this.messages().find((m) => m.client_msg_id === cid);
  }

  /** Send one pending message: socket first, REST when offline / unacknowledged (same client_msg_id = safe retry). */
  private async deliver(cid: string): Promise<void> {
    const msg = this.find(cid);
    if (!msg) return;
    const id = this.orderId();
    try {
      let body: SendBody;
      if (msg.kind === 'voice') {
        let up = msg.uploaded;
        if (!up) {
          const pending = msg.pending;
          if (!pending) throw new Error('This recording is no longer available.');
          const { data } = await firstValueFrom(this.chat.uploadVoice(id, { dataUrl: pending.dataUrl, duration: pending.duration }));
          up = { path: data.path, duration: data.duration, mime: data.mime, size: data.size };
          this.patchLocal(cid, { uploaded: up });
        }
        body = { kind: 'voice', audio: up, client_msg_id: cid, ...(msg.unit_id ? { unit_id: msg.unit_id } : {}) };
      } else {
        body = { kind: 'text', body: msg.body ?? '', client_msg_id: cid, ...(msg.unit_id ? { unit_id: msg.unit_id } : {}) };
      }

      let saved: ChatMessage;
      try {
        saved = await this.socket.send(id, body);
      } catch (socketErr) {
        // A definite rejection (rate limit, validation) is final; anything else retries over REST.
        if ((socketErr as { status?: number }).status) throw socketErr;
        const res: ApiResult<ChatMessage> = await firstValueFrom(this.chat.send(id, body));
        saved = res.data;
      }
      if (this.orderId() !== id) return;
      if (this.scopeOf(saved) !== this.unitId()) return; // the reader switched chats while it was sending
      this.upsert([saved]);
      if (this.nearBottom()) this.scrollToBottom();
    } catch (err) {
      if (this.orderId() !== id) return;
      this.patchLocal(cid, { status: 'failed' });
      this.toast.error(errorMessage(err), 'Message not sent.');
    }
  }

  // ───────── scrolling ─────────

  private nearBottom(): boolean {
    const el = this.scroller()?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  private scrollToBottom(): void {
    afterNextRender(
      () => {
        const el = this.scroller()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      },
      { injector: this.injector },
    );
  }
}
