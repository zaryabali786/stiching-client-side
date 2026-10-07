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
      <div class="sheet-backdrop" (click)="dismiss()"></div>
      <section class="sheet" [class.tall]="tall()" role="dialog" aria-modal="true" [attr.aria-label]="title()" tabindex="-1" #panel [style.bottom.px]="keyboard()" [style.max-height]="'calc(100% - 40px - env(safe-area-inset-top, 0px) - ' + keyboard() + 'px)'">
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
    .sheet:focus { outline: none; }
    .sheet {
      position: fixed; z-index: 901; left: 50%; bottom: 0;
      transform: translate(-50%, 0);
      width: 100%; max-width: var(--shell-max, 480px);
      max-height: calc(100% - 40px - env(safe-area-inset-top, 0px));
      display: flex; flex-direction: column;
      background: var(--c-bg);
      border-radius: 24px 24px 0 0;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.18);
      animation: sheet-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .sheet.tall { height: calc(100% - 24px - env(safe-area-inset-top, 0px)); }
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
    .sheet-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 16px 18px; }
    .sheet-body.flush { padding-bottom: 0; }
    .sheet-foot {
      padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px));
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
