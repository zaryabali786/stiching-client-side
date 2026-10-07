import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LEGACY_FIELDS, MEASUREMENT_GROUPS, SizeChartView } from '../core/models/api.models';
import { SizeDiagramComponent } from './size-diagram.component';

/** Read-only chart: diagram on the left, "label ... value in" rows on the right (blank = em dash). */
@Component({
  selector: 'app-size-view',
  imports: [SizeDiagramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (g of groups(); track g.id) {
      <section class="grp" [attr.aria-labelledby]="'sv-' + g.id">
        <h3 class="grp-title" [id]="'sv-' + g.id">{{ g.title }}</h3>
        <div class="grp-body">
          <app-size-diagram class="fig" [type]="g.id" [values]="chart().measurements" />
          <dl>
            @for (r of g.rows; track r.key) {
              <div [class.blank]="r.value === null">
                <dt>{{ r.label }}</dt>
                <dd class="tabular">
                  @if (r.value === null) {
                    <span aria-label="not set">—</span>
                  } @else {
                    {{ r.value }}<small> in</small>
                  }
                </dd>
              </div>
            }
          </dl>
        </div>
      </section>
    }
    @if (legacy().length) {
      <section class="grp" aria-labelledby="sv-other">
        <h3 class="grp-title" id="sv-other">Other</h3>
        <dl class="solo">
          @for (r of legacy(); track r.key) {
            <div><dt>{{ r.label }}</dt><dd class="tabular">{{ r.value }}<small> in</small></dd></div>
          }
        </dl>
      </section>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
    .grp-title { font-family: var(--font-serif); font-size: 19px; font-weight: 700; color: var(--c-ink); margin: 0 0 10px; }
    .grp-body { display: flex; flex-direction: column; gap: 14px; }
    .fig { width: 100%; max-width: 440px; margin: 0 auto; }
    dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); column-gap: 18px; }
    dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-height: 44px; padding: 8px 0; border-bottom: 1px solid var(--c-line-soft); }
    dt { font-size: var(--fs-md); color: var(--c-muted); min-width: 0; }
    dd { margin: 0; font-size: var(--fs-body); font-weight: 600; color: var(--c-ink); white-space: nowrap; }
    dd small { font-size: var(--fs-xs); font-weight: 500; color: var(--c-muted); }
    .blank dd { color: var(--c-faint); font-weight: 400; }
    .solo { max-width: 340px; }
  `,
})
export class SizeViewComponent {
  readonly chart = input.required<SizeChartView>();

  protected groups = computed(() => {
    const m = this.chart().measurements as Record<string, number | null | undefined>;
    return MEASUREMENT_GROUPS.map((g) => ({
      id: g.id,
      title: g.title,
      rows: g.fields.map((f) => ({ key: f.key, label: f.label, value: typeof m[f.key] === 'number' ? (m[f.key] as number) : null })),
    }));
  });

  protected legacy = computed(() => {
    const m = this.chart().measurements as Record<string, number | null | undefined>;
    return LEGACY_FIELDS.filter((f) => typeof m[f.key] === 'number').map((f) => ({ key: f.key, label: f.label, value: m[f.key] as number }));
  });
}
