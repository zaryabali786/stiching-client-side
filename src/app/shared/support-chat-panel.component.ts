import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { SupportChatService, SupportMessage } from '../core/services/support-chat.service';
import { VoicePlayerComponent } from './voice-player.component';
import { VoiceRecorderComponent, VoiceRecording } from './voice-recorder.component';

/**
 * The customer's general chat with the admin team: messages (text and voice) and a composer (text box, microphone, send).
 * Maroon (#62003E) is the colour of this chat: the send button, the customer's bubbles, the recorder and the voice player.
 */
@Component({
  selector: 'app-support-chat-panel',
  imports: [FormsModule, DatePipe, IonIcon, IonSpinner, VoicePlayerComponent, VoiceRecorderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="list" #list role="log" aria-live="polite" aria-label="Messages with our team">
      @if (chat.loading() && !chat.messages().length) {
        <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
      } @else if (chat.error() && !chat.messages().length) {
        <div class="center">
          <p>{{ chat.error() }}</p>
          <button type="button" class="btn btn-outline btn-sm" (click)="chat.load()">Retry</button>
        </div>
      } @else if (!chat.messages().length) {
        <div class="center empty">
          <ion-icon name="chatbubbles" aria-hidden="true"></ion-icon>
          <strong>Say hello</strong>
          <span>Ask our team anything. We reply here.</span>
        </div>
      } @else {
        @if (chat.hasMore()) {
          <button type="button" class="link-btn older" (click)="chat.loadOlder()">Load earlier messages</button>
        }
        @for (m of chat.messages(); track m.id) {
          <div class="row" [class.mine]="m.sender_role === 'customer'">
            <div class="bubble" [class.failed]="m.status === 'failed'" [class.voice]="m.kind === 'voice'">
              @if (m.kind === 'voice' && m.audio) {
                <app-voice-player [src]="m.audio.url" [duration]="m.audio.duration ?? 0" [mime]="m.audio.mime" />
              } @else {
                <span class="txt">{{ m.body }}</span>
              }
              <span class="meta">
                {{ m.created_at | date: 'shortTime' }}
                @if (m.sender_role === 'customer') {
                  @if (m.status === 'sending') { · sending… }
                  @else if (m.status === 'failed') { · <button type="button" class="link-btn retry" (click)="chat.retry(m)">Retry</button> }
                  @else if (m.read_at) { · seen }
                }
              </span>
            </div>
          </div>
        }
      }
    </div>

    @if (voiceError()) {
      <div class="voice-err" role="alert">
        <span>{{ voiceError() }}</span>
        @if (voiceSilent()) { <button type="button" class="btn btn-outline btn-sm" (click)="rec.start()">Record again</button> }
      </div>
    }
    <form class="composer" [class.recording]="recording()" (ngSubmit)="send()">
      @if (!recording()) {
        <textarea class="field" rows="1" maxlength="4000" placeholder="Write a message…" aria-label="Message" [ngModel]="text()" (ngModelChange)="text.set($event)" name="msg" (keydown.enter)="onEnter($any($event))"></textarea>
      }
      <app-voice-recorder #rec variant="icon" label="Record a voice message" sendLabel="Send voice message" [showError]="false" (recorded)="sendVoice($event)" (recordingChange)="recording.set($event)" (errorChange)="voiceError.set($event)" (silentChange)="voiceSilent.set($event)" />
      @if (!recording()) {
        <button type="submit" class="send" [disabled]="!text().trim()" aria-label="Send message">
          <ion-icon name="send" aria-hidden="true"></ion-icon>
        </button>
      }
    </form>
  `,
  styles: `
    :host {
      display: flex; flex-direction: column; height: 100%; min-height: 0;
      /* the colour of this chat: the recorder, the voice player and the buttons inside follow it */
      --chat-accent: #62003E;
      --c-brand: #62003E; --c-brand-fill: #62003E; --c-brand-2: #7B0A52; --c-on-brand: #fff; --c-brand-soft: #F6E8F0;
    }
    .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 6px 18px 10px; overscroll-behavior: contain; }
    .center { margin: auto; text-align: center; color: var(--c-muted); display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 24px; }
    .empty ion-icon { font-size: 40px; color: #1f2937; margin-bottom: 6px; }
    .empty strong { font-size: var(--fs-md); color: var(--c-ink); font-weight: 600; }
    .empty span { font-size: var(--fs-sm); color: var(--c-faint, #9ca3af); }
    .older { align-self: center; }
    .row { display: flex; }
    .row.mine { justify-content: flex-end; }
    .bubble { max-width: 82%; padding: 9px 13px; border-radius: 18px; background: #F1F2F4; color: var(--c-ink); display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .mine .bubble { background: var(--chat-accent); color: #fff; border-bottom-right-radius: 6px; }
    .row:not(.mine) .bubble { border-bottom-left-radius: 6px; }
    /* a voice message sits on a light bubble on both sides, so its player stays readable */
    .bubble.voice { background: #fff; color: var(--c-ink); border: 1px solid var(--c-line); padding: 6px 10px 5px 6px; width: min(100%, 300px); }
    .mine .bubble.voice { border-bottom-right-radius: 6px; border-color: #E3C4D5; }
    .txt { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; font-size: var(--fs-md); }
    .meta { font-size: 11px; opacity: 0.7; align-self: flex-end; }
    .failed { outline: 1.5px solid var(--t-red-dot); }
    .retry { color: inherit; text-decoration: underline; min-height: 0; padding: 0; }
    .voice-err { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 0 18px 6px; color: var(--t-red-dot, #b42318); font-size: var(--fs-sm); }
    .composer { flex: none; display: flex; align-items: flex-end; gap: 10px; padding: 12px 16px calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))); border-top: 1px solid var(--c-line-soft); background: var(--c-surface, #fff); }
    .field { flex: 1; min-width: 0; resize: none; max-height: 120px; min-height: 44px; padding: 11px 16px; border: 1px solid var(--c-line); border-radius: 22px; background: #FAFAFB; color: var(--c-ink); font: inherit; font-size: var(--fs-md); line-height: 1.35; outline: none; }
    .field::placeholder { color: #B6B8BE; }
    .field:focus { border-color: var(--chat-accent); background: #fff; box-shadow: 0 0 0 3px rgba(98, 0, 62, 0.12); }
    .send { flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: var(--chat-accent); color: #fff; display: grid; place-items: center; cursor: pointer; font-size: 20px; box-shadow: 0 4px 12px rgba(98, 0, 62, 0.28); transition: opacity 0.15s, transform 0.1s; }
    .send:active:not(:disabled) { transform: scale(0.95); }
    .send:disabled { opacity: 0.45; box-shadow: none; cursor: not-allowed; }
    .send:focus-visible { outline: 2px solid var(--chat-accent); outline-offset: 2px; }
    /* the microphone: a round outlined button next to Send; while recording the recorder takes the whole row */
    .composer app-voice-recorder { flex: none; align-self: flex-end; }
    .composer.recording app-voice-recorder { flex: 1; align-self: center; }
    .composer ::ng-deep .vr-btn.icon { width: 44px; height: 44px; min-height: 44px; border: 1.5px solid #D9B9CC; background: #fff; color: var(--chat-accent); }
    .composer ::ng-deep .vr-btn.icon:hover:not(:disabled) { background: #F6E8F0; border-color: var(--chat-accent); }
  `,
})
export class SupportChatPanelComponent implements OnDestroy {
  protected chat = inject(SupportChatService);
  protected text = signal('');
  protected recording = signal(false);
  protected voiceError = signal<string | null>(null);
  protected voiceSilent = signal(false);
  private listEl = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    this.chat.setViewing(true);
    effect(() => {
      this.chat.messages();
      untracked(() => setTimeout(() => {
        const el = this.listEl()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      }));
    });
  }

  ngOnDestroy(): void {
    this.chat.setViewing(false);
  }

  protected onEnter(e: KeyboardEvent): void {
    if (e.shiftKey) return;
    e.preventDefault();
    this.send();
  }

  protected send(): void {
    const body = this.text().trim();
    if (!body) return;
    this.chat.send(body);
    this.text.set('');
  }

  protected sendVoice(rec: VoiceRecording): void {
    this.voiceError.set(null);
    this.chat.sendVoice(rec);
  }
}

export type { SupportMessage };
