import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { SheetComponent } from '../../../../shared/sheet.component';
import { VoiceNoteFieldComponent } from '../../../../shared/voice-note-field.component';
import { voiceField } from '../../../../core/utils/voice-note';
import { SizeDiagramComponent } from '../../../../shared/size-diagram.component';
import { SizeService } from '../../../../core/services/size.service';
import { ToastService } from '../../../../core/services/toast.service';
import { errorMessage } from '../../../../core/services/api.service';
import {
  LEGACY_FIELDS,
  MEASUREMENT_GROUPS,
  Measurements,
  NEAREST_SIZES,
  NearestSize,
  SizeChart,
  SizeChartInput,
  VoiceNote,
} from '../../../../core/models/api.models';

type Draft = Record<string, number | null>;

const ALL_KEYS = [...MEASUREMENT_GROUPS.flatMap((g) => g.fields.map((f) => f.key as string)), ...LEGACY_FIELDS.map((f) => f.key as string)];

/**
 * Create / edit a size chart (POST/PATCH /client/sizes) in a tall bottom sheet: nearest size, then a line
 * drawing beside the shirt fields and another beside the trouser fields. Used by the Sizes page and by
 * the new-order form.
 */
@Component({
  selector: 'app-size-chart-form',
  imports: [FormsModule, IonIcon, IonSpinner, SheetComponent, SizeDiagramComponent, VoiceNoteFieldComponent],
  templateUrl: './size-chart-form.component.html',
  styleUrl: './size-chart-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SizeChartFormComponent {
  private sizes = inject(SizeService);
  private toast = inject(ToastService);

  readonly open = input(false);
  /** Chart to edit; null = create. */
  readonly chart = input<SizeChart | null>(null);
  /** Existing people, offered as quick picks. */
  readonly people = input<string[]>([]);
  readonly defaultPerson = input('');
  /** Person cannot be changed (adding a variation for someone). */
  readonly lockPerson = input(false);
  /** "+ Variation": offer to start from this chart's measurements. */
  readonly copyFrom = input<SizeChart | null>(null);

  readonly saved = output<SizeChart>();
  readonly closed = output<void>();

  readonly groups = MEASUREMENT_GROUPS;
  readonly nearestSizes = NEAREST_SIZES;

  personName = signal('');
  variation = signal('');
  nearest = signal<NearestSize | null>(null);
  notes = signal('');
  /** Voice note next to the written note: undefined = none/unchanged, null = removed, with `path` = new upload. */
  notesAudio = signal<VoiceNote | null | undefined>(undefined);
  private hadAudio = false;
  audioBusy = signal(false);
  values = signal<Draft>({});
  startFromCopy = signal(true);
  activeKey = signal<string | null>(null);
  /** On-screen keyboard up / short screen: the diagram stops being sticky so it never covers the field being typed in. */
  short = signal(false);
  saving = signal(false);
  submitted = signal(false);
  error = signal<string | null>(null);

  isEdit = computed(() => !!this.chart());
  personFixed = computed(() => this.isEdit() || this.lockPerson());
  /** Older keys (shalwar_gheer, neck_depth) are only shown when the chart being edited has them. */
  legacyFields = computed(() => {
    const m = (this.chart()?.measurements ?? {}) as Record<string, unknown>;
    return LEGACY_FIELDS.filter((f) => typeof m[f.key] === 'number');
  });

  private vvListener = () => this.short.set((window.visualViewport?.height ?? window.innerHeight) < 560);

  constructor() {
    inject(DestroyRef).onDestroy(() => window.visualViewport?.removeEventListener('resize', this.vvListener));
    // Watch the visible height while the sheet is open (keyboard).
    effect(() => {
      const vv = window.visualViewport;
      if (this.open()) {
        this.vvListener();
        vv?.addEventListener('resize', this.vvListener);
      } else vv?.removeEventListener('resize', this.vvListener);
    });
    // Reset the form each time the sheet opens.
    effect(() => {
      if (!this.open()) return;
      const chart = this.chart();
      const copy = this.copyFrom();
      untracked(() => {
        this.submitted.set(false);
        this.error.set(null);
        this.activeKey.set(null);
        this.startFromCopy.set(true);
        this.personName.set(chart?.person_name ?? (this.lockPerson() && copy ? copy.person_name : this.defaultPerson()));
        this.variation.set(chart ? chart.variation : '');
        this.notes.set(chart?.notes ?? '');
        this.notesAudio.set(chart?.notes_audio ?? undefined);
        this.hadAudio = !!chart?.notes_audio;
        this.audioBusy.set(false);
        this.fill(chart ?? copy);
      });
    });
  }

  /** Load measurements (and nearest size) from a chart, or clear them. */
  private fill(source: SizeChart | null): void {
    const m: Draft = {};
    for (const k of ALL_KEYS) m[k] = ((source?.measurements ?? {}) as Record<string, number | undefined>)[k] ?? null;
    this.values.set(m);
    this.nearest.set(source?.nearest_size ?? null);
  }

  toggleCopy(on: boolean): void {
    this.startFromCopy.set(on);
    this.fill(on ? this.copyFrom() : null);
  }

  toggleNearest(size: NearestSize): void {
    this.nearest.update((n) => (n === size ? null : size));
  }

  setValue(key: string, raw: number | string | null): void {
    const n = raw === '' || raw === null ? null : Number(raw);
    this.values.update((m) => ({ ...m, [key]: n === null || Number.isNaN(n) ? null : n }));
  }

  invalid(key: string): boolean {
    const v = this.values()[key];
    return v !== null && v !== undefined && (v < 0 || v > 120);
  }

  /** Enter in a number field moves on to the next one instead of submitting the form. */
  nextField(event: Event): void {
    event.preventDefault();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.scf-form input[type="number"]'));
    const i = inputs.indexOf(event.target as HTMLInputElement);
    inputs[i + 1]?.focus();
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  save(): void {
    if (this.audioBusy()) return;
    this.submitted.set(true);
    this.error.set(null);
    const person = this.personName().trim();
    if (!person) {
      this.error.set('Who is this size chart for? (e.g. Me, Mother)');
      return;
    }
    if (ALL_KEYS.some((k) => this.invalid(k))) {
      this.error.set('Measurements must be between 0 and 120 inches.');
      return;
    }
    const measurements: Measurements = {};
    // keep any older keys the chart already had (e.g. shalwar_gheer) unless they were cleared
    for (const k of ALL_KEYS) {
      const v = this.values()[k];
      if (typeof v === 'number') (measurements as Record<string, number>)[k] = v;
    }
    const body: SizeChartInput = {
      person_name: person,
      variation: this.variation().trim() || 'Standard',
      nearest_size: this.nearest(),
      measurements,
      notes: this.notes().trim() || null,
    };
    const va = voiceField(this.notesAudio(), this.hadAudio);
    if (va.has) body.notes_audio = va.value;

    this.saving.set(true);
    const chart = this.chart();
    const req$ = chart ? this.sizes.update(chart.id, body) : this.sizes.create(body);
    req$.subscribe({
      next: ({ data, message }) => {
        this.saving.set(false);
        this.toast.success(message || 'Size chart saved.');
        this.saved.emit(data);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(errorMessage(err));
        // bring the message into view (the form is long)
        document.querySelector('.scf-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      },
    });
  }
}
