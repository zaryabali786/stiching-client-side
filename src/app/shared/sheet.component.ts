import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * Lightweight bottom sheet (no Ionic overlay) — slides up from the bottom, centred at the shell
 * width on desktop, respects the safe area. Content is projected; a footer slot is available via
 * `[sheet-footer]`.
 */
@Component({
  selector: 'app-sheet',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="sheet-backdrop" [class.light]="look() === 'choice'" (click)="dismiss()"></div>
      <section class="sheet" [class.tall]="tall()" [class.chat-look]="look() === 'chat'" [class.confirm-look]="look() === 'confirm'" [class.panel-look]="look() === 'panel'" [class.choice-look]="look() === 'choice'" role="dialog" aria-modal="true" [attr.aria-label]="title()" tabindex="-1" #panel [style.bottom.px]="keyboard()" [style.max-height]="'calc(100% - 40px - var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) - ' + keyboard() + 'px)'">
        <header class="sheet-head">
          <span class="grabber" aria-hidden="true"></span>
          <div class="sheet-titles">
            @if (eyebrow()) {
              <span class="eyebrow">{{ eyebrow() }}</span>
            }
            <h3>{{ title() }}</h3>
          </div>
          <button type="button" class="icon-btn" (click)="dismiss()" aria-label="Close">
            <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
          </button>
        </header>
        <div class="sheet-body" [class.flush]="flush()"><ng-content /></div>
        <footer class="sheet-foot"><ng-content select="[sheet-footer]" /></footer>
      </section>
    }
  `,
  styles: `
    :host { display: contents; }
    @keyframes sheet-up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    .sheet-backdrop {
      position: fixed; inset: 0; z-index: 900;
      background: rgba(18, 24, 20, 0.45);
      animation: fade-in 0.2s ease both;
    }
    .sheet-backdrop.light { background: rgba(255, 255, 255, 0.82); backdrop-filter: blur(2px); }
    .sheet:focus { outline: none; }
    .sheet {
      position: fixed; z-index: 901; left: 50%; bottom: 0;
      transform: translate(-50%, 0);
      width: 100%; max-width: var(--shell-max, 480px);
      max-height: calc(100% - 40px - var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));
      display: flex; flex-direction: column;
      background: var(--c-bg);
      border-radius: 24px 24px 0 0;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.18);
      animation: sheet-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .sheet.tall { height: calc(100% - 24px - var(--safe-area-inset-top, env(safe-area-inset-top, 0px))); }
    .sheet-head {
      position: relative; display: flex; align-items: flex-start; gap: 12px;
      padding: 22px 12px 12px 18px; border-bottom: 1px solid var(--c-line-soft);
    }
    .grabber {
      position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
      width: 38px; height: 4px; border-radius: 4px; background: var(--c-line-strong);
    }
    .sheet-titles { flex: 1; min-width: 0; }
    h3 { font-family: var(--font-serif); font-size: 24px; font-weight: 700; line-height: 1.15; color: var(--c-ink); }
    .sheet-titles .eyebrow { margin-bottom: 2px; }
    /* the support chat: plain title in the chat colour, round outlined close button (the design of the chat sheet) */
    .sheet.chat-look .sheet-head { padding: 20px 16px 10px 20px; border-bottom: 0; align-items: center; }
    .sheet.chat-look h3 { font-family: var(--font-sans); font-size: var(--fs-body, 15px); font-weight: 500; letter-spacing: 0; color: #62003E; }
    .sheet.chat-look .icon-btn { width: 30px; height: 30px; min-height: 30px; padding: 0; border: 1px solid var(--c-line-strong); border-radius: 50%; background: #fff; color: var(--c-muted); display: grid; place-items: center; }
    .sheet.chat-look .icon-btn ion-icon { font-size: 16px; }
    /* a plain confirmation (confirm an order): a short title, the details, then two buttons; closed with Cancel, the backdrop or Escape */
    .sheet.confirm-look .grabber, .sheet.confirm-look .icon-btn { display: none; }
    .sheet.confirm-look .sheet-head { padding: 24px 22px 6px; border-bottom: 0; }
    .sheet.confirm-look h3 { font-family: var(--font-sans); font-size: 22px; font-weight: 500; line-height: 1.2; letter-spacing: -0.01em; color: #1f2937; }
    .sheet.confirm-look .sheet-body { padding: 12px 22px 8px; }
    .sheet.confirm-look .sheet-foot { border-top: 0; background: transparent; padding: 10px 22px calc(18px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))); }
    /* a list sheet (notifications): a bold plain title, a round outlined close button */
    .sheet.panel-look .sheet-head { padding: 22px 18px 8px 22px; border-bottom: 0; align-items: center; }
    .sheet.panel-look h3 { font-family: var(--font-sans); font-size: 26px; font-weight: 600; letter-spacing: -0.015em; color: #1f2937; }
    .sheet.panel-look .icon-btn { width: 34px; height: 34px; min-height: 34px; padding: 0; border: 1px solid #A1A1AA; border-radius: 50%; background: #fff; color: #52525b; display: grid; place-items: center; }
    .sheet.panel-look .icon-btn ion-icon { font-size: 18px; }
    .sheet.panel-look .sheet-body { padding: 8px 18px 20px; }
    /* a short choice sheet (new order): white, a small maroon label, a plain title, a round outlined close button */
    .sheet.choice-look { background: #fff; }
    .sheet.choice-look .sheet-head { padding: 26px 18px 8px 22px; border-bottom: 0; align-items: center; }
    .sheet.choice-look .grabber { top: 8px; width: 40px; background: #D4D4D8; }
    .sheet.choice-look .eyebrow { font-size: 10px; letter-spacing: 0.02em; text-transform: uppercase; color: #62003E; }
    .sheet.choice-look h3 { font-family: var(--font-sans); font-size: 22px; font-weight: 500; letter-spacing: -0.01em; color: #111827; }
    .sheet.choice-look .icon-btn { width: 32px; height: 32px; min-height: 32px; padding: 0; border: 1px solid #A1A1AA; border-radius: 50%; background: #fff; color: #52525b; display: grid; place-items: center; align-self: flex-start; }
    .sheet.choice-look .icon-btn ion-icon { font-size: 16px; }
    .sheet.choice-look .sheet-body { padding: 8px 18px calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))); }
    .sheet-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 16px 18px; }
    .sheet-body.flush { padding-bottom: 0; }
    .sheet-foot {
      padding: 12px 18px calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
      border-top: 1px solid var(--c-line-soft);
      background: var(--c-surface);
    }
    .sheet-foot:empty { display: none; }
  `,
})
export class SheetComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly eyebrow = input('');
  /** Prevent closing (e.g. while saving). */
  readonly locked = input(false);
  /** Fill (almost) the whole screen height, e.g. long forms. */
  readonly tall = input(false);
  /** No padding under the content (it brings its own bottom bar, e.g. the chat composer). */
  readonly flush = input(false);
  /** 'chat' = the look of the support chat sheet (plain title in the chat colour, round close button); 'confirm' = a plain confirmation sheet. */
  readonly look = input<'default' | 'chat' | 'confirm' | 'panel' | 'choice'>('default');
  readonly closed = output<void>();

  private panel = viewChild<ElementRef<HTMLElement>>('panel');
  private returnFocus: HTMLElement | null = null;
  /** Height of the on-screen keyboard overlapping the layout viewport, so the sheet stays above it. */
  protected keyboard = signal(0);

  constructor() {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
      const update = () => this.keyboard.set(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      inject(DestroyRef).onDestroy(() => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      });
    }

    // Move focus into the sheet when it opens and give it back to the trigger when it closes.
    effect(() => {
      const el = this.panel()?.nativeElement;
      if (el) {
        this.returnFocus = document.activeElement as HTMLElement | null;
        queueMicrotask(() => el.focus({ preventScroll: true }));
      } else if (this.returnFocus) {
        const back = this.returnFocus;
        this.returnFocus = null;
        queueMicrotask(() => back.focus?.({ preventScroll: true }));
      }
    });
  }

  dismiss(): void {
    if (!this.locked()) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.dismiss();
  }
}
