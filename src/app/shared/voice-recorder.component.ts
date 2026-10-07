import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { formatClock } from './voice-player.component';

export interface VoiceRecording {
  blob: Blob;
  dataUrl: string;
  /** Seconds. */
  duration: number;
  mime: string;
}

/** First supported wins: mp4/AAC plays on every phone, then WebM/Opus and Ogg. */
export const MIME_CANDIDATES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const MIN_SECONDS = 1;
/** Loudest moment (RMS, 0..1) below this for a while means the microphone is probably not picking us up. */
const QUIET_RMS = 0.006;
/** Below this the microphone delivered (near) digital silence: the recording is not kept. */
const SILENT_RMS = 0.002;
/** The hint appears only after this many seconds of metering in which the level never passed QUIET_RMS. */
const QUIET_HINT_AFTER_S = 4;
const LEVEL_TICK_MS = 80;
const BAR_COUNT = 40;
const MIN_BAR = 8;
export const SILENT_MESSAGE = "We couldn't hear anything. Check that the right microphone is selected and not muted, then try again.";

export function pickMime(): string | undefined {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Voice-note recorder (MediaRecorder), WhatsApp style. Idle: a record button. Recording: a pill with Cancel (trash) on
 * the left, a pulsing dot, the running timer and live level bars, and a round Send button on the right. The pill is
 * the host's only content, so a parent (the chat composer) can let it replace its whole row.
 * Auto-stops at the maximum length and hands back `{ blob, dataUrl, duration, mime }`.
 */
@Component({
  selector: 'app-voice-recorder',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-recording]': 'recording()' },
  template: `
    @if (recording()) {
      <div class="vr-bar" role="group" aria-label="Recording voice note">
        <button type="button" class="vr-cancel" (click)="cancel()" aria-label="Cancel recording" title="Cancel">
          <ion-icon name="trash-outline" aria-hidden="true"></ion-icon>
        </button>
        <div class="vr-main">
          <div class="vr-row">
            <span class="vr-dot" aria-hidden="true"></span>
            <span class="vr-time tabular" [class.near-end]="nearEnd()" role="timer" aria-live="off">{{ clock(elapsed()) }}</span>
            <span class="vr-wave" role="meter" aria-label="Microphone level" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="level()">
              @for (h of bars(); track $index) {
                <i [style.height.%]="h"></i>
              }
            </span>
          </div>
          @if (noSound()) {
            <span class="vr-warn" role="status">No sound yet. Check your microphone.</span>
          }
        </div>
        <button type="button" class="vr-send" (click)="stop()" [attr.aria-label]="sendLabel()" [title]="sendLabel()">
          <ion-icon name="send" aria-hidden="true"></ion-icon>
        </button>
        <span class="sr-only" role="status" aria-live="polite">{{ announce() }}</span>
      </div>
    } @else if (starting()) {
      <button type="button" class="vr-btn" [class.icon]="variant() === 'icon'" disabled aria-busy="true" aria-label="Waiting for microphone permission">
        <ion-icon name="mic-outline" aria-hidden="true"></ion-icon>
        @if (variant() === 'button') {
          <span>Allow the microphone…</span>
        }
      </button>
    } @else {
      <button type="button" class="vr-btn" [class.icon]="variant() === 'icon'" (click)="start()" [disabled]="disabled()" [attr.aria-label]="variant() === 'icon' ? label() : null">
        <ion-icon name="mic-outline" aria-hidden="true"></ion-icon>
        @if (variant() === 'button') {
          <span>{{ label() }}</span>
        }
      </button>
    }
    @if (error() && showError()) {
      <span class="field-error vr-error" role="alert">{{ error() }}</span>
      @if (silent()) {
        <button type="button" class="btn btn-outline btn-sm vr-again" (click)="start()">Record again</button>
      }
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    :host(.is-recording) { flex: 1; }
    .vr-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 18px;
      border-radius: 999px; border: 1.5px dashed var(--c-line-strong); background: var(--c-surface-warm); color: var(--c-brand);
      font-size: var(--fs-sm); font-weight: 600; letter-spacing: 0.04em; cursor: pointer;
    }
    .vr-btn ion-icon { font-size: 20px; }
    .vr-btn:hover:not(:disabled) { border-color: var(--c-brand); }
    .vr-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .vr-btn.icon { width: 48px; height: 48px; min-height: 48px; padding: 0; border-style: solid; background: var(--c-surface); }
    .vr-btn.icon ion-icon { font-size: 22px; }

    .vr-bar {
      display: flex; align-items: center; gap: 6px; min-height: 52px; padding: 2px; border-radius: 999px;
      background: var(--c-surface); border: 1px solid var(--c-line-strong);
    }
    .vr-cancel, .vr-send {
      flex: none; width: 48px; height: 48px; border: 0; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 22px;
    }
    .vr-cancel { background: none; color: var(--t-red-fg); }
    .vr-cancel:hover { background: var(--t-red-bg); }
    .vr-send { background: var(--c-brand); color: #fff; box-shadow: 0 4px 14px rgba(15, 57, 43, 0.22); }
    .vr-send:hover { background: var(--c-brand-2); }
    .vr-cancel:focus-visible, .vr-send:focus-visible { outline: 2px solid var(--c-focus); outline-offset: 2px; }
    .vr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 1px; }
    .vr-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .vr-dot { flex: none; width: 11px; height: 11px; border-radius: 50%; background: var(--t-red-dot); animation: vr-pulse 1.1s ease-in-out infinite; }
    @keyframes vr-pulse { 50% { opacity: 0.35; transform: scale(0.8); } }
    .vr-time { flex: none; min-width: 34px; font-weight: 600; font-size: var(--fs-body); color: var(--c-ink); white-space: nowrap; }
    .vr-time.near-end { color: var(--t-red-fg); }
    .vr-wave { flex: 1; min-width: 0; height: 28px; display: flex; align-items: center; justify-content: flex-end; gap: 2px; overflow: hidden; }
    .vr-wave i { flex: none; width: 3px; min-height: 3px; border-radius: 2px; background: var(--c-brand); opacity: 0.8; transition: height 0.08s linear; }
    .vr-warn { font-size: var(--fs-xs); line-height: 1.25; color: var(--t-amber-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vr-error { margin-top: 6px; }
    .vr-again { margin-top: 8px; }
    @media (prefers-reduced-motion: reduce) { .vr-dot { animation: none; } .vr-wave i { transition: none; } }
  `,
})
export class VoiceRecorderComponent {
  readonly maxSeconds = input(300);
  readonly variant = input<'button' | 'icon'>('button');
  readonly label = input('Record a voice note');
  /** Accessible name of the round button that finishes the recording. */
  readonly sendLabel = input('Send voice message');
  readonly disabled = input(false);
  /** Turn off to show `errorChange` messages elsewhere (e.g. under a chat composer). */
  readonly showError = input(true);

  readonly errorChange = output<string | null>();
  readonly recorded = output<VoiceRecording>();
  /** Recording was cancelled (or failed) and nothing was produced. */
  readonly cancelled = output<void>();
  readonly recordingChange = output<boolean>();
  /** True when the last recording was silent (nothing was kept or uploaded). */
  readonly silentChange = output<boolean>();

  protected recording = signal(false);
  protected starting = signal(false);
  protected elapsed = signal(0);
  protected level = signal(0);
  /** Recent levels (percent of bar height), oldest first: the live waveform. */
  protected bars = signal<number[]>(this.emptyBars());
  protected noSound = signal(false);
  protected silent = signal(false);
  private peak = 0;
  /** Seconds of metering while the audio context was actually running. */
  private measured = 0;
  private lastTick = 0;
  private canMeasure = false;
  private audioCtx: AudioContext | null = null;
  private levelTimer?: ReturnType<typeof setInterval>;
  protected error = signal<string | null>(null);
  private setError(message: string | null): void {
    this.error.set(message);
    this.errorChange.emit(message);
  }
  protected announce = signal('');
  protected clock = formatClock;
  protected nearEnd = () => this.elapsed() >= this.maxSeconds() - 15;

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timer?: ReturnType<typeof setInterval>;
  private discard = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.discard = true;
      this.teardown();
    });
  }

  private emptyBars(): number[] {
    return new Array<number>(BAR_COUNT).fill(MIN_BAR);
  }

  async start(): Promise<void> {
    if (this.recording() || this.starting()) return;
    this.setError(null);
    this.setSilent(false);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.setError(
        window.isSecureContext === false
          ? 'Voice notes need a secure (https) connection.'
          : "Voice notes aren't supported in this browser. You can still type your message.",
      );
      return;
    }
    this.starting.set(true);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.starting.set(false);
      this.setError(this.permissionMessage(err));
      return;
    }
    try {
      const mimeType = pickMime();
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    } catch {
      this.starting.set(false);
      this.teardown();
      this.setError("This browser can't record audio. You can still type your message.");
      return;
    }
    this.chunks = [];
    this.discard = false;
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onerror = () => {
      this.discard = true;
      this.setError('Recording stopped unexpectedly. Please try again.');
      this.finish();
    };
    this.recorder.onstop = () => void this.onStopped();
    this.recorder.start(250);
    this.startedAt = performance.now();
    this.elapsed.set(0);
    this.starting.set(false);
    this.recording.set(true);
    this.recordingChange.emit(true);
    this.announce.set('Recording started');
    this.startMeter();
    this.timer = setInterval(() => {
      const secs = (performance.now() - this.startedAt) / 1000;
      this.elapsed.set(secs);
      if (secs >= this.maxSeconds()) this.stop();
    }, 200);
  }

  protected stop(): void {
    this.discard = false;
    this.finish();
  }

  protected cancel(): void {
    this.discard = true;
    this.finish();
  }

  private finish(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    else void this.onStopped();
  }

  private async onStopped(): Promise<void> {
    const mime = this.recorder?.mimeType || this.chunks[0]?.type || 'audio/webm';
    const seconds = Math.min(this.maxSeconds(), (performance.now() - this.startedAt) / 1000);
    const chunks = this.chunks;
    const discard = this.discard;
    // Only a microphone that delivered (near) digital silence while we were really measuring is refused.
    const silent = this.canMeasure && this.measured >= MIN_SECONDS && this.peak < SILENT_RMS;
    this.teardown();
    if (this.recording()) {
      this.recording.set(false);
      this.recordingChange.emit(false);
    }
    if (discard || !chunks.length) {
      this.cancelled.emit();
      return;
    }
    if (silent) {
      // Nothing was heard: never upload or send an empty recording.
      this.setError(SILENT_MESSAGE);
      this.setSilent(true);
      this.cancelled.emit();
      return;
    }
    if (seconds < MIN_SECONDS) {
      this.setError('That was too short. Hold on a little longer and try again.');
      return;
    }
    const blob = new Blob(chunks, { type: mime });
    try {
      const dataUrl = await readAsDataUrl(blob);
      this.recorded.emit({ blob, dataUrl, duration: Math.round(seconds * 10) / 10, mime });
    } catch {
      this.setError('Could not read the recording. Please try again.');
    }
  }

  private setSilent(v: boolean): void {
    if (this.silent() === v) return;
    this.silent.set(v);
    this.silentChange.emit(v);
  }

  /** Live microphone level (Web Audio analyser on the same stream): drives the bars and tracks the loudest moment. */
  private startMeter(): void {
    this.peak = 0;
    this.measured = 0;
    this.canMeasure = false;
    this.level.set(0);
    this.bars.set(this.emptyBars());
    this.noSound.set(false);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || !this.stream) return;
    try {
      const ctx = new Ctx();
      void ctx.resume().catch(() => undefined);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(this.stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      this.audioCtx = ctx;
      this.canMeasure = true;
      this.lastTick = performance.now();
      this.levelTimer = setInterval(() => {
        const now = performance.now();
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;
        // A context the browser still holds suspended reads zeros: do not mistake that for a silent microphone.
        if (ctx.state !== 'running') {
          void ctx.resume().catch(() => undefined);
          return;
        }
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        const rms = Math.sqrt(sum / data.length);
        this.measured += dt;
        if (rms > this.peak) this.peak = rms;
        this.level.set(Math.min(100, Math.round(rms * 400)));
        const bar = Math.max(MIN_BAR, Math.min(100, Math.round(Math.sqrt(rms) * 230)));
        this.bars.update((b) => [...b.slice(1), bar]);
        // Only after a few seconds of metering in which the level never passed the threshold.
        this.noSound.set(this.measured >= QUIET_HINT_AFTER_S && this.peak < QUIET_RMS);
      }, LEVEL_TICK_MS);
    } catch {
      this.canMeasure = false; // cannot measure: do not block the recording
    }
  }

  private teardown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    clearInterval(this.levelTimer);
    this.levelTimer = undefined;
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.noSound.set(false);
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  private permissionMessage(err: unknown): string {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone access is blocked. Allow it in your browser settings, then try again.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found on this device.';
    if (name === 'NotReadableError') return 'The microphone is being used by another app.';
    return 'Could not start the microphone. Please try again.';
  }
}
