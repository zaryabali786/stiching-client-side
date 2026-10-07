import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, effect, inject, input, output, signal, untracked, viewChild, ElementRef } from '@angular/core';
import { IonIcon } from '@ionic/angular';

const SIZE = 56;
const EDGE = 8;
const DRAG_THRESHOLD = 6;
const STEP = 16;
const STORAGE_KEY = 'stx_chat_fab_v1';

interface Saved {
  side: 'left' | 'right';
  y: number;
}

/**
 * Floating round chat button that can be dragged anywhere inside the app column (mouse, touch, or Alt+arrow keys),
 * snaps to the nearest side edge, remembers where it was left and stays clear of the header and of any bottom bar.
 * A press that moves less than 6px is a normal click.
 */
@Component({
  selector: 'app-chat-fab',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #btn
      type="button"
      class="fab"
      [class.dragging]="dragging()"
      [class.pulse]="pulsing()"
      [style.transform]="transform()"
      [style.visibility]="placed() ? 'visible' : 'hidden'"
      [attr.aria-label]="label()"
      aria-haspopup="dialog"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onUp($event)"
      (click)="onClick($event)"
      (keydown)="onKey($event)"
    >
      <ion-icon name="chatbubbles" aria-hidden="true"></ion-icon>
      @if (unread() > 0) {
        <span class="badge" aria-hidden="true">{{ unread() > 99 ? '99+' : unread() }}</span>
      }
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ announce() }}</span>
  `,
  styles: `
    :host { display: contents; }
    .fab {
      position: fixed; left: 0; top: 0; z-index: 800;
      width: 56px; height: 56px; padding: 0; border: 0; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--c-brand); color: #fff; font-size: 26px; cursor: grab;
      box-shadow: var(--shadow-float);
      touch-action: none; user-select: none; -webkit-user-select: none;
      transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s ease;
    }
    .fab.dragging { transition: none; cursor: grabbing; box-shadow: 0 14px 34px rgba(28, 27, 25, 0.28); }
    .fab:focus-visible { outline: 3px solid var(--c-gold-light); outline-offset: 3px; }
    .badge {
      position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
      background: var(--t-red-dot); color: #fff; border: 2px solid var(--c-bg); font-size: 12px; font-weight: 700;
      line-height: 18px; text-align: center; font-variant-numeric: tabular-nums;
    }
    .fab.pulse { box-shadow: 0 0 0 5px rgba(198, 61, 42, 0.35), var(--shadow-float); animation: fab-pulse 1.4s ease-out 1; }
    @keyframes fab-pulse {
      0% { box-shadow: 0 0 0 0 rgba(198, 61, 42, 0.55), var(--shadow-float); }
      100% { box-shadow: 0 0 0 18px rgba(198, 61, 42, 0), var(--shadow-float); }
    }
  `,
})
export class ChatFabComponent {
  readonly unread = input(0);
  /** Bump this number to pulse the button (a new message arrived while the chat is closed). */
  readonly pulseKey = input(0);
  /** Anything that changes the bars at the bottom (sticky action bar, tab bar): triggers a re-clamp. */
  readonly layoutKey = input<unknown>(null);
  readonly activated = output<void>();

  private btn = viewChild.required<ElementRef<HTMLButtonElement>>('btn');
  protected x = signal(0);
  protected y = signal(0);
  protected placed = signal(false);
  protected dragging = signal(false);
  protected pulsing = signal(false);
  protected announce = signal('');

  private side: 'left' | 'right' = 'right';
  private start: { px: number; py: number; ox: number; oy: number; id: number } | null = null;
  private suppressClick = false;
  private pulseTimer?: ReturnType<typeof setTimeout>;
  private safeBottom = 0;

  protected transform = () => `translate3d(${this.x()}px, ${this.y()}px, 0)`;
  protected label = () => (this.unread() > 0 ? `Chat, ${this.unread()} unread` : 'Chat');

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pulseTimer));

    // Place after the first render, when the header and bars exist to measure.
    effect(() => {
      this.layoutKey();
      untracked(() => setTimeout(() => this.place(), 60));
    });

    let first = true;
    effect(() => {
      this.pulseKey();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        this.pulsing.set(true);
        this.announce.set('New message');
        clearTimeout(this.pulseTimer);
        this.pulseTimer = setTimeout(() => {
          this.pulsing.set(false);
          this.announce.set('');
        }, 1600);
      });
    });
  }

  // ───────── geometry ─────────

  /** Where the button may sit: inside the app column, below the header, above any bottom bar. */
  private bounds(): { left: number; right: number; top: number; bottom: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const shell = document.querySelector('app-client-shell')?.getBoundingClientRect();
    const header = document.querySelector('.shell-header')?.getBoundingClientRect();
    let bottom = vh - this.readSafeBottom() - EDGE;
    const tab = document.querySelector<HTMLElement>('.tabbar');
    if (tab && getComputedStyle(tab).display !== 'none') bottom = Math.min(bottom, tab.getBoundingClientRect().top - EDGE);
    const bar = document.querySelector<HTMLElement>('.action-bar')?.getBoundingClientRect();
    if (bar && bar.height > 0 && bar.top < vh) bottom = Math.min(bottom, bar.top - 12);
    return {
      left: Math.max(0, shell?.left ?? 0) + EDGE,
      right: Math.min(vw, shell?.right ?? vw) - EDGE,
      top: (header?.bottom ?? 0) + EDGE,
      bottom,
    };
  }

  private readSafeBottom(): number {
    if (this.safeBottom) return this.safeBottom;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden';
    document.body.appendChild(probe);
    this.safeBottom = probe.offsetHeight;
    probe.remove();
    return this.safeBottom;
  }

  private clampY(y: number, b = this.bounds()): number {
    return Math.round(Math.min(Math.max(y, b.top), Math.max(b.top, b.bottom - SIZE)));
  }

  private sideX(side: 'left' | 'right', b = this.bounds()): number {
    return side === 'left' ? b.left : b.right - SIZE;
  }

  private load(): Saved | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const v = raw ? (JSON.parse(raw) as Saved) : null;
      return v && (v.side === 'left' || v.side === 'right') && typeof v.y === 'number' ? v : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: this.side, y: this.y() } satisfies Saved));
    } catch {
      /* storage unavailable: the position just is not remembered */
    }
  }

  /** (Re)compute the resting position from the saved side / height and the current bounds. */
  protected place(): void {
    const b = this.bounds();
    const saved = this.load();
    if (this.placed()) {
      // already shown: keep the current spot, only re-clamp it
      this.x.set(this.sideX(this.side, b));
      this.y.set(this.clampY(this.y(), b));
      return;
    }
    this.side = saved?.side ?? 'right';
    this.x.set(this.sideX(this.side, b));
    this.y.set(this.clampY(saved?.y ?? b.bottom - SIZE - 16, b));
    this.placed.set(true);
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onResize(): void {
    if (this.placed()) this.place();
  }

  // ───────── pointer drag ─────────

  protected onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.start = { px: e.clientX, py: e.clientY, ox: this.x(), oy: this.y(), id: e.pointerId };
    try {
      this.btn().nativeElement.setPointerCapture(e.pointerId);
    } catch {
      /* not supported: dragging still works while the pointer stays over the button */
    }
  }

  protected onMove(e: PointerEvent): void {
    const s = this.start;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!this.dragging() && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    this.dragging.set(true);
    const b = this.bounds();
    this.x.set(Math.round(Math.min(Math.max(s.ox + dx, b.left), b.right - SIZE)));
    this.y.set(this.clampY(s.oy + dy, b));
  }

  protected onUp(e: PointerEvent): void {
    const s = this.start;
    if (!s || e.pointerId !== s.id) return;
    this.start = null;
    try {
      this.btn().nativeElement.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!this.dragging()) return; // a tap: let the click through
    this.dragging.set(false);
    // The click that follows a drag must not open the chat.
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    const b = this.bounds();
    this.side = this.x() + SIZE / 2 < (b.left + b.right) / 2 ? 'left' : 'right';
    this.x.set(this.sideX(this.side, b));
    this.y.set(this.clampY(this.y(), b));
    this.save();
  }

  protected onClick(e: MouseEvent): void {
    if (this.suppressClick) {
      e.preventDefault();
      return;
    }
    this.activated.emit();
  }

  // ───────── keyboard (no dragging needed) ─────────

  protected onKey(e: KeyboardEvent): void {
    if (!e.altKey) return;
    const d: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    const delta = d[e.key];
    if (!delta) return;
    e.preventDefault();
    const b = this.bounds();
    this.x.set(Math.round(Math.min(Math.max(this.x() + delta[0], b.left), b.right - SIZE)));
    this.y.set(this.clampY(this.y() + delta[1], b));
    this.side = this.x() + SIZE / 2 < (b.left + b.right) / 2 ? 'left' : 'right';
    this.save();
    this.announce.set('Chat button moved');
    setTimeout(() => this.announce.set(''), 800);
  }
}
