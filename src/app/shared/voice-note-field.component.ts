import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { VoiceNote } from '../core/models/api.models';
import { VoiceService } from '../core/services/voice.service';
import { VoicePlayerComponent, formatClock } from './voice-player.component';
import { VoiceRecorderComponent, VoiceRecording } from './voice-recorder.component';

/**
 * "Add a voice note" under a text note. Records (5 min max), uploads straight away and exposes the stored
 * reference through the two-way `value`:
 *  - `undefined` / a saved note from the API (no `path`): unchanged, nothing to send;
 *  - an object with a `path`: just uploaded, send its reference;
 *  - `null`: removed.
 * In `hold` mode nothing is uploaded: the recording is handed to the parent (`recorded` / `removed`), which
 * sends it later (used for the order note, which becomes a chat message once the order exists).
 */
@Component({
  selector: 'app-voice-note-field',
  imports: [IonIcon, IonSpinner, VoicePlayerComponent, VoiceRecorderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vn">
      @if (uploading()) {
        <div class="vn-row" role="status">
          <ion-spinner name="crescent"></ion-spinner>
          <span>Saving voice note…</span>
        </div>
      } @else if (failed(); as msg) {
        <div class="vn-fail" role="alert">
          <span>{{ msg }}</span>
          <div class="vn-actions">
            <button type="button" class="btn btn-outline btn-sm" (click)="retry()">Retry</button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="discard()">Discard</button>
          </div>
        </div>
      } @else if (shown(); as n) {
        <div class="vn-card">
          @if (n.url) {
            <app-voice-player [src]="n.url" [duration]="n.duration" [mime]="n.mime" (loadFailed)="playerFailed.emit()" />
          } @else {
            <span class="vn-saved"><ion-icon name="mic-outline" aria-hidden="true"></ion-icon> Voice note saved · {{ clock(n.duration) }}</span>
          }
          <div class="vn-actions">
            <button type="button" class="btn btn-outline btn-sm" (click)="reRecord()" [disabled]="disabled()">Re-record</button>
            <button type="button" class="icon-btn danger" (click)="remove()" [disabled]="disabled()" aria-label="Remove voice note">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
        </div>
      } @else {
        <app-voice-recorder
          #recorder
          [label]="label()"
          sendLabel="Save voice note"
          [disabled]="disabled()"
          [showError]="false"
          (recorded)="onRecorded($event)"
          (cancelled)="rerecording.set(false)"
          (recordingChange)="recordingChange.emit($event)"
          (silentChange)="silent.set($event)"
          (errorChange)="onRecError($event)"
        />
      }
      @if (recError()) {
        <span class="field-error" role="alert">{{ recError() }}</span>
        @if (silent()) {
          <button type="button" class="btn btn-outline btn-sm vn-again" (click)="recordAgain()">Record again</button>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .vn { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .vn-row { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 14px; border-radius: 14px; background: var(--c-surface-2); color: var(--c-ink-2); font-size: var(--fs-md); }
    .vn-row ion-spinner { width: 20px; height: 20px; color: var(--c-brand); }
    .vn-card, .vn-fail { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--c-line); background: var(--c-surface-2); }
    .vn-fail { border-color: var(--t-red-line); background: var(--t-red-bg); color: var(--t-red-fg); font-size: var(--fs-md); line-height: 1.4; }
    .vn-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .vn-actions .icon-btn { margin-left: auto; }
    .vn-again { align-self: flex-start; }
    .vn-saved { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: var(--fs-md); font-weight: 600; color: var(--c-ink); }
    .vn-saved ion-icon { font-size: 20px; color: var(--c-brand); }
  `,
})
export class VoiceNoteFieldComponent {
  private voice = inject(VoiceService);

  /** Upload mode: undefined = unchanged, null = removed, object with `path` = new upload. */
  readonly value = model<VoiceNote | null | undefined>(undefined);
  readonly mode = input<'upload' | 'hold'>('upload');
  /** Hold mode: the recording kept by the parent. */
  readonly held = input<VoiceRecording | null>(null);
  readonly label = input('Add a voice note');
  readonly disabled = input(false);

  readonly recorded = output<VoiceRecording>();
  readonly removed = output<void>();
  /** True while a clip is being uploaded (disable Save / Next). */
  readonly busy = output<boolean>();
  /** Forwarded from the recorder (live recording in progress). */
  readonly recordingChange = output<boolean>();
  /** The saved clip's signed link failed to load (ask the page to reload its data). */
  readonly playerFailed = output<void>();

  protected uploading = signal(false);
  protected failed = signal<string | null>(null);
  protected recError = signal<string | null>(null);
  protected rerecording = signal(false);
  protected silent = signal(false);
  private pending: VoiceRecording | null = null;
  private recorder = viewChild<VoiceRecorderComponent>('recorder');
  protected clock = formatClock;

  private note = computed<VoiceNote | null>(() => {
    if (this.mode() === 'hold') {
      const h = this.held();
      return h ? { mime: h.mime, duration: h.duration, size: h.blob.size, url: h.dataUrl } : null;
    }
    return this.value() ?? null;
  });
  protected shown = computed(() => (this.rerecording() ? null : this.note()));

  protected onRecorded(rec: VoiceRecording): void {
    this.recError.set(null);
    this.rerecording.set(false);
    if (this.mode() === 'hold') {
      this.recorded.emit(rec);
      return;
    }
    this.upload(rec);
  }

  protected onRecError(message: string | null): void {
    this.recError.set(message);
    if (message) this.rerecording.set(false);
  }

  private upload(rec: VoiceRecording): void {
    this.pending = rec;
    this.failed.set(null);
    this.uploading.set(true);
    this.busy.emit(true);
    this.voice.upload({ dataUrl: rec.dataUrl, duration: rec.duration }).subscribe({
      next: ({ data }) => {
        this.value.set({ path: data.path, mime: data.mime, size: data.size, duration: data.duration, url: data.url });
        this.pending = null;
        this.uploading.set(false);
        this.busy.emit(false);
      },
      error: (err: Error) => {
        this.failed.set(err.message || 'The voice note could not be saved.');
        this.uploading.set(false);
        this.busy.emit(false);
      },
    });
  }

  protected retry(): void {
    if (this.pending) this.upload(this.pending);
  }

  protected discard(): void {
    this.pending = null;
    this.failed.set(null);
  }

  protected remove(): void {
    this.recError.set(null);
    if (this.mode() === 'hold') this.removed.emit();
    else this.value.set(null);
  }

  protected recordAgain(): void {
    this.recError.set(null);
    void this.recorder()?.start();
  }

  protected reRecord(): void {
    this.rerecording.set(true);
    setTimeout(() => void this.recorder()?.start());
  }
}
