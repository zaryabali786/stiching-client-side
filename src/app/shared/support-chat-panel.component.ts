import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { SupportChatService, SupportMessage } from '../core/services/support-chat.service';

/** The customer's general chat with the admin team: a message list and a text box. */
@Component({
  selector: 'app-support-chat-panel',
  imports: [FormsModule, DatePipe, IonIcon, IonSpinner],
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
          <ion-icon name="chatbubbles-outline" aria-hidden="true"></ion-icon>
          <strong>Say hello</strong>
          <span>Ask our team anything. We reply here.</span>
        </div>
      } @else {
        @if (chat.hasMore()) {
          <button type="button" class="link-btn older" (click)="chat.loadOlder()">Load earlier messages</button>
        }
        @for (m of chat.messages(); track m.id) {
          <div class="row" [class.mine]="m.sender_role === 'customer'">
            <div class="bubble" [class.failed]="m.status === 'failed'">
              <span class="txt">{{ m.body }}</span>
              <span class="meta">
                {{ m.created_at | date: 'shortTime' }}
                @if (m.sender_role === 'customer') {
                  @if (m.status === 'sending') { · sending… }
                  @else if (m.status === 'failed') { · <button type="button" class="link-btn retry" (click)="chat.send(m.body, m)">Retry</button> }
                  @else if (m.read_at) { · seen }
                }
              </span>
            </div>
          </div>
        }
      }
    </div>
    <form class="composer" (ngSubmit)="send()">
      <textarea class="input" rows="1" maxlength="4000" placeholder="Write a message…" aria-label="Message" [ngModel]="text()" (ngModelChange)="text.set($event)" name="msg" (keydown.enter)="onEnter($any($event))"></textarea>
      <button type="submit" class="btn btn-primary send" [disabled]="!text().trim()" aria-label="Send">
        <ion-icon name="send-outline" aria-hidden="true"></ion-icon>
      </button>
    </form>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px 2px 10px; overscroll-behavior: contain; }
    .center { margin: auto; text-align: center; color: var(--c-muted); display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px; }
    .empty ion-icon { font-size: 40px; color: var(--c-brand); }
    .older { align-self: center; }
    .row { display: flex; }
    .row.mine { justify-content: flex-end; }
    .bubble { max-width: 82%; padding: 9px 12px; border-radius: 16px; background: var(--c-surface-3); color: var(--c-ink); display: flex; flex-direction: column; gap: 3px; }
    .mine .bubble { background: var(--c-brand); color: var(--c-on-brand, #fff); border-bottom-right-radius: 6px; }
    .row:not(.mine) .bubble { border-bottom-left-radius: 6px; }
    .txt { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; }
    .meta { font-size: 11px; opacity: 0.7; align-self: flex-end; }
    .failed { outline: 1.5px solid var(--t-red-dot); }
    .retry { color: inherit; text-decoration: underline; min-height: 0; padding: 0; }
    .composer { flex: none; display: flex; align-items: flex-end; gap: 8px; padding: 10px 0 calc(6px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--c-line-soft); }
    .composer textarea { flex: 1; resize: none; max-height: 120px; min-height: 44px; }
    .send { flex: none; width: 46px; height: 46px; padding: 0; border-radius: 50%; }
  `,
})
export class SupportChatPanelComponent {
  protected chat = inject(SupportChatService);
  protected text = signal('');
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
}

export type { SupportMessage };
