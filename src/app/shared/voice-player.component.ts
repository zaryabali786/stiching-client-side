import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular';

const RATES = [1, 1.5, 2] as const;

/** Only one voice message plays at a time. */
let playing: HTMLAudioElement | null = null;

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Accessible voice-message player: play/pause, seekable progress, elapsed/total, 1x / 1.5x / 2x. */
@Component({
  selector: 'app-voice-player',
  imports: [IonIcon, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (unsupported()) {
      <p class="vp-unsupported" role="alert">This device can't play this voice message format.</p>
    } @else {
    <div class="vp">
      <audio
        #audio
        preload="metadata"
        [src]="src() || null"
        (loadedmetadata)="onMeta()"
        (timeupdate)="onTime()"
        (play)="isPlaying.set(true)"
        (pause)="isPlaying.set(false)"
        (ended)="onEnded()"
        (waiting)="buffering.set(true)"
        (playing)="buffering.set(false)"
        (canplay)="buffering.set(false)"
        (error)="onError()"
      ></audio>

      <button type="button" class="vp-play" (click)="toggle()" [disabled]="!src()" [attr.aria-label]="isPlaying() ? 'Pause voice message' : 'Play voice message'">
        @if (buffering() && isPlaying()) {
          <ion-spinner name="crescent"></ion-spinner>
        } @else {
          <ion-icon [name]="isPlaying() ? 'pause' : 'play'" aria-hidden="true"></ion-icon>
        }
      </button>

      <div class="vp-mid">
        <input
          class="vp-range"
          type="range"
          min="0"
          [max]="total()"
          step="0.1"
          [value]="current()"
          [style.--p]="progress() + '%'"
          [disabled]="!src() || failed()"
          aria-label="Seek voice message"
          [attr.aria-valuetext]="clock(current()) + ' of ' + clock(total())"
          (input)="seek($event)"
        />
        <span class="vp-time tabular">
          @if (failed()) {
            {{ failMessage() }}
          } @else {
            {{ clock(current()) }} / {{ clock(total()) }}
          }
        </span>
      </div>

      @if (failed()) {
        <button type="button" class="vp-rate" (click)="retry()" aria-label="Reload voice message">Retry</button>
      } @else {
        <button type="button" class="vp-rate" (click)="cycleRate()" [attr.aria-label]="'Playback speed ' + rate() + 'x. Change speed'">{{ rate() }}x</button>
      }
    </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .vp-unsupported { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--t-amber-bg); color: var(--t-amber-fg); font-size: var(--fs-md); line-height: 1.4; }
    .vp { display: flex; align-items: center; gap: 6px; min-width: 200px; }
    .vp-play {
      flex: none; width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer;
      background: var(--c-brand); color: #fff; font-size: 18px; display: flex; align-items: center; justify-content: center;
    }
    .vp-play:disabled { opacity: 0.5; cursor: not-allowed; }
    .vp-play ion-spinner { width: 20px; height: 20px; color: #fff; }
    .vp-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .vp-time { font-size: var(--fs-xs); color: var(--c-muted); line-height: 1.2; }
    .vp-rate {
      flex: none; min-width: 44px; min-height: 44px; border: 0; background: none; cursor: pointer;
      color: var(--c-brand); font-size: var(--fs-sm); font-weight: 700; border-radius: 12px;
    }
    .vp-range {
      -webkit-appearance: none; appearance: none; width: 100%; height: 28px; margin: 0; background: transparent; cursor: pointer;
    }
    .vp-range::-webkit-slider-runnable-track {
      height: 4px; border-radius: 4px;
      background: linear-gradient(to right, var(--c-brand) var(--p, 0%), var(--c-line-strong) var(--p, 0%));
    }
    .vp-range::-moz-range-track { height: 4px; border-radius: 4px; background: var(--c-line-strong); }
    .vp-range::-moz-range-progress { height: 4px; border-radius: 4px; background: var(--c-brand); }
    .vp-range::-webkit-slider-thumb {
      -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%;
      background: var(--c-brand); border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }
    .vp-range::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--c-brand); border: 2px solid #fff; }
    .vp-range:focus-visible { outline: 2px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
    .vp-range:disabled { cursor: default; }
  `,
})
export class VoicePlayerComponent {
  readonly src = input<string | null>(null);
  /** Known length in seconds (recorded webm files carry no duration metadata). */
  readonly duration = input(0);
  /** The message's audio type (e.g. audio/webm;codecs=opus): used to say so when this device cannot play it. */
  readonly mime = input<string | null>(null);
  /** Emitted when the audio cannot be loaded (e.g. its signed link expired). */
  readonly loadFailed = output<void>();

  private audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');
  protected isPlaying = signal(false);
  protected buffering = signal(false);
  protected failed = signal(false);
  protected failMessage = signal("Couldn't load audio");
  /** The browser reports it cannot play this audio type at all. */
  protected unsupported = computed(() => {
    const m = this.mime();
    if (!m || typeof document === 'undefined') return false;
    return document.createElement('audio').canPlayType(m) === '';
  });
  protected current = signal(0);
  private metaDuration = signal(0);
  protected rate = signal<number>(1);
  protected total = computed(() => this.duration() || this.metaDuration() || 0);
  protected progress = computed(() => (this.total() ? Math.min(100, (this.current() / this.total()) * 100) : 0));
  protected clock = formatClock;

  constructor() {
    // A fresh signed link replaces the old one: clear the error and let the element reload.
    effect(() => {
      this.src();
      untracked(() => this.failed.set(false));
    });
  }

  protected onMeta(): void {
    const d = this.audio().nativeElement.duration;
    if (Number.isFinite(d) && d > 0) this.metaDuration.set(d);
  }

  protected onTime(): void {
    const el = this.audio().nativeElement;
    this.current.set(el.currentTime);
    if (!this.duration() && Number.isFinite(el.duration)) this.metaDuration.set(el.duration);
  }

  protected onEnded(): void {
    this.isPlaying.set(false);
    this.current.set(0);
    this.audio().nativeElement.currentTime = 0;
    if (playing === this.audio().nativeElement) playing = null;
  }

  protected onError(): void {
    if (!this.src()) return;
    this.failMessage.set("Couldn't load audio");
    this.failed.set(true);
    this.isPlaying.set(false);
    this.loadFailed.emit();
  }

  protected retry(): void {
    this.failed.set(false);
    this.audio().nativeElement.load();
    this.loadFailed.emit();
  }

  protected async toggle(): Promise<void> {
    const el = this.audio().nativeElement;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (playing && playing !== el) playing.pause();
    playing = el;
    el.playbackRate = this.rate();
    this.failed.set(false);
    try {
      await el.play();
    } catch (err) {
      // Say why instead of leaving a dead button.
      const name = err instanceof DOMException ? err.name : '';
      this.failMessage.set(name === 'NotSupportedError' ? "This device can't play this format" : name === 'NotAllowedError' ? 'Tap play again to start' : "Couldn't play this voice message");
      this.failed.set(true);
      if (name !== 'NotAllowedError') this.loadFailed.emit();
    }
  }

  protected seek(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.audio().nativeElement.currentTime = value;
    this.current.set(value);
  }

  protected cycleRate(): void {
    const next = RATES[(RATES.indexOf(this.rate() as 1) + 1) % RATES.length];
    this.rate.set(next);
    this.audio().nativeElement.playbackRate = next;
  }
}
