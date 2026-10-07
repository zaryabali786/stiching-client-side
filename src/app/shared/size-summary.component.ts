import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { LEGACY_FIELDS, MEASUREMENT_GROUPS, SizeChartView } from '../core/models/api.models';
import { SizeDiagramComponent } from './size-diagram.component';
import { VoicePlayerComponent } from './voice-player.component';

let nextId = 0;

/** One-line size description with an expandable list of the saved measurements (never edits). */
@Component({
  selector: 'app-size-summary',
  imports: [IonIcon, SizeDiagramComponent, VoicePlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chart(); as c) {
      <div class="sz">
        <div class="sz-head">
          <span class="sz-line">{{ line() }}</span>
          <button type="button" class="sz-toggle" (click)="open.set(!open())" [attr.aria-expanded]="open()" [attr.aria-controls]="panelId">
            {{ open() ? 'Hide measurements' : 'View measurements' }}
            <ion-icon [name]="open() ? 'chevron-up-outline' : 'chevron-down-outline'" aria-hidden="true"></ion-icon>
          </button>
        </div>
        @if (open()) {
          <div class="sz-panel" [id]="panelId">
            @for (g of groups(); track g.title) {
              <div class="sz-group">
                <span class="sz-title">{{ g.title }}</span>
                @if (g.id) {
                  <app-size-diagram class="sz-fig" [type]="g.id" [values]="values()" />
                }
                <dl>
                  @for (r of g.rows; track r.label) {
                    <div><dt>{{ r.label }}</dt><dd class="tabular">{{ r.value }}″</dd></div>
                  }
                </dl>
              </div>
            } @empty {
              <p class="sz-empty">No measurements saved on this chart yet.</p>
            }
            @if (c.notes) {
              <p class="sz-note">“{{ c.notes }}”</p>
            }
            @if (c.notes_audio?.url; as src) {
              <app-voice-player [src]="src" [duration]="c.notes_audio!.duration" [mime]="c.notes_audio!.mime" />
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .sz { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .sz-head { display: flex; align-items: center; flex-wrap: wrap; gap: 0 10px; min-width: 0; }
    .sz-line { flex: 1 1 auto; min-width: 0; font-size: var(--fs-md); font-weight: 600; color: var(--c-ink); }
    .sz-toggle {
      display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0; border: 0; background: none;
      color: var(--c-brand); font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
      text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--c-gold-line);
    }
    .sz-panel {
      display: flex; flex-direction: column; gap: 12px; padding: 12px; border-radius: 12px;
      background: var(--c-surface-2); border: 1px solid var(--c-line);
    }
    .sz-title { display: block; margin-bottom: 4px; font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-gold-dark); }
    .sz-fig { width: 100%; max-width: 320px; margin: 4px auto 8px; padding: 6px; border-radius: 12px; background: var(--c-surface); }
    dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 2px 16px; }
    dl > div { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--c-line-soft); font-size: var(--fs-md); }
    dt { color: var(--c-muted); min-width: 0; }
    dd { margin: 0; font-weight: 600; color: var(--c-ink); white-space: nowrap; }
    .sz-note, .sz-empty { margin: 0; font-size: var(--fs-md); line-height: 1.45; color: var(--c-ink-2); }
    .sz-note { font-style: italic; }
  `,
})
export class SizeSummaryComponent {
  readonly chart = input<SizeChartView | null | undefined>(null);
  protected open = signal(false);
  protected panelId = `size-summary-${++nextId}`;

  protected line = computed(() => {
    const c = this.chart();
    if (!c) return '';
    return [c.person_name, c.variation, c.nearest_size ? `nearest ${c.nearest_size}` : ''].filter(Boolean).join(' · ');
  });

  protected values = computed(() => (this.chart()?.measurements ?? {}) as Record<string, number | undefined>);

  protected groups = computed(() => {
    const m = (this.chart()?.measurements ?? {}) as Record<string, unknown>;
    const rows = (fields: readonly { key: string; label: string }[]) =>
      fields.filter((f) => typeof m[f.key] === 'number').map((f) => ({ label: f.label, value: m[f.key] as number }));
    const out: { id: 'shirt' | 'trouser' | null; title: string; rows: { label: string; value: number }[] }[] = MEASUREMENT_GROUPS.map((g) => ({ id: g.id, title: g.title, rows: rows(g.fields) }));
    out.push({ id: null, title: 'Other', rows: rows(LEGACY_FIELDS) });
    return out.filter((g) => g.rows.length);
  });
}
