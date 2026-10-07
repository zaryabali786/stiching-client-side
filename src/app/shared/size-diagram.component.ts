import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MeasurementKey, SHIRT_FIELDS, TROUSER_FIELDS } from '../core/models/api.models';

interface Marker {
  key: MeasurementKey;
  /** Arrow shaft. */
  line: string;
  /** Filled arrowheads. */
  heads: string;
  /** Thin extension lines that connect the arrow to the garment edge. */
  ext: string;
  label: string[];
  lx: number;
  ly: number;
  rot: number;
  /** Where the entered value is printed. */
  vx: number;
  vy: number;
}

const HEAD = 9;
const HALF = 3.4;

const f1 = (n: number) => Math.round(n * 10) / 10;

/** Filled triangle with its tip at (x, y) pointing along (dx, dy). */
function head(x: number, y: number, dx: number, dy: number): string {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x - ux * HEAD;
  const by = y - uy * HEAD;
  return `M${f1(x)} ${f1(y)}L${f1(bx - uy * HALF)} ${f1(by + ux * HALF)}L${f1(bx + uy * HALF)} ${f1(by - ux * HALF)}Z`;
}

/** Straight double-headed arrow; the shaft stops inside the heads so tips stay crisp. */
function arrow(x1: number, y1: number, x2: number, y2: number): { line: string; heads: string } {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  return {
    line: `M${f1(x1 + ux * (HEAD - 1))} ${f1(y1 + uy * (HEAD - 1))}L${f1(x2 - ux * (HEAD - 1))} ${f1(y2 - uy * (HEAD - 1))}`,
    heads: head(x1, y1, -ux, -uy) + head(x2, y2, ux, uy),
  };
}

/** Curved double-headed arrow (quadratic). */
function curve(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): { line: string; heads: string } {
  return {
    line: `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`,
    heads: head(x1, y1, x1 - cx, y1 - cy) + head(x2, y2, x2 - cx, y2 - cy),
  };
}

const labelOf = (fields: readonly { key: string; label: string }[], key: string): string => {
  if (key === 'cuff_opening') return 'Cuff opening';
  return fields.find((f) => f.key === key)?.label ?? key;
};

const SHIRT_OUTLINE = 'M150 24Q180 52 210 24L282 40L318 250L288 262L272 128L292 490L70 490L88 128L46 268L14 250L78 40Z';
const SHIRT_DETAIL = 'M150 24Q180 62 210 24M78 40Q100 84 88 128M282 40Q260 84 272 128';
const TROUSER_OUTLINE = 'M110 44L250 44L270 108L256 470L196 470L180 186L164 470L104 470L90 108Z';
const TROUSER_DETAIL = 'M112 62Q180 74 248 62';

const m = (key: MeasurementKey, fields: readonly { key: string; label: string }[], shape: { line: string; heads: string }, p: Partial<Marker>): Marker => ({
  key, ext: '', label: [labelOf(fields, key)], lx: 0, ly: 0, rot: 0, vx: 0, vy: 0, ...shape, ...p,
});

const SHIRT: Marker[] = [
  m('shoulder', SHIRT_FIELDS, arrow(78, 12, 282, 12), { ext: 'M78 40V6M282 40V6', lx: 180, ly: 12, vx: 245, vy: 12 }),
  m('bust', SHIRT_FIELDS, arrow(93, 152, 267, 152), { lx: 180, ly: 152, vx: 180, vy: 171 }),
  m('waist', SHIRT_FIELDS, arrow(89, 226, 272, 226), { lx: 180, ly: 226, vx: 180, vy: 245 }),
  m('hip', SHIRT_FIELDS, arrow(85, 300, 278, 300), { lx: 180, ly: 300, vx: 180, vy: 319 }),
  m('bottom', SHIRT_FIELDS, arrow(77, 476, 285, 476), { lx: 180, ly: 476, vx: 180, vy: 458 }),
  m('shirt_length', SHIRT_FIELDS, arrow(346, 24, 346, 490), { ext: 'M214 24H352M296 490H352', lx: 346, ly: 257, rot: -90, vx: 366, vy: 257 }),
  m('sleeve', SHIRT_FIELDS, arrow(-11, 242, 53, 32), { lx: 21, ly: 137, rot: -73, vx: 5, vy: 132 }),
  m('cuff_opening', SHIRT_FIELDS, arrow(7, 262, 39, 280), { lx: 23, ly: 271, rot: 29, vx: 14, vy: 288 }),
  m('armhole', SHIRT_FIELDS, arrow(256, 48, 256, 126), { lx: 256, ly: 87, rot: -90, vx: 238, vy: 87 }),
];

const TROUSER: Marker[] = [
  m('waist_relaxed', TROUSER_FIELDS, arrow(100, 24, 260, 24), { ext: 'M110 44V14M250 44V14', lx: 180, ly: 24, vx: 180, vy: 4 }),
  m('trouser_hip', TROUSER_FIELDS, arrow(94, 108, 266, 108), { lx: 180, ly: 108, vx: 180, vy: 88 }),
  m('trouser_length', TROUSER_FIELDS, arrow(36, 44, 36, 470), { ext: 'M36 44H110M36 470H104', lx: 36, ly: 257, rot: -90, vx: 15, vy: 257 }),
  m('front_rise', TROUSER_FIELDS, curve(164, 128, 144, 152, 173, 180), { label: ['Front', 'rise'], lx: 126, ly: 146, vx: 126, vy: 176 }),
  m('back_rise', TROUSER_FIELDS, curve(196, 128, 216, 152, 187, 180), { label: ['Back', 'rise'], lx: 234, ly: 146, vx: 234, vy: 176 }),
  m('thigh', TROUSER_FIELDS, arrow(188, 236, 262, 236), { lx: 225, ly: 236, vx: 225, vy: 255 }),
  m('knee', TROUSER_FIELDS, arrow(194, 340, 257, 340), { lx: 225, ly: 340, vx: 225, vy: 359 }),
  m('bottom_opening', TROUSER_FIELDS, arrow(196, 498, 256, 498), { ext: 'M196 470V504M256 470V504', label: ['Bottom (single)'], lx: 226, ly: 522, vx: 226, vy: 540 }),
];

/**
 * Front-view line drawing of a kameez or trouser with a solid double-headed arrow per measurement and its
 * name written on the arrow (same words as the form fields). Purely visual (aria-hidden): the fields and
 * value rows next to it carry the meaning.
 */
@Component({
  selector: 'app-size-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg [attr.viewBox]="viewBox()" preserveAspectRatio="xMidYMid meet" focusable="false">
      <g [attr.transform]="type() === 'shirt' ? 'translate(24 0)' : null">
        <path class="outline" [attr.d]="outline()" />
        <path class="detail" [attr.d]="detail()" />
        @for (mk of markers(); track mk.key) {
          <g class="marker" [class.on]="active() === mk.key" [class.empty]="hasValues() && valueOf(mk.key) === null">
            @if (mk.ext) {
              <path class="ext" [attr.d]="mk.ext" />
            }
            <path class="shaft" [attr.d]="mk.line" />
            <path class="heads" [attr.d]="mk.heads" />
            <text class="name" [attr.transform]="mk.rot ? 'rotate(' + mk.rot + ' ' + mk.lx + ' ' + mk.ly + ')' : null" [attr.x]="mk.lx" [attr.y]="mk.ly" text-anchor="middle">
              @for (line of mk.label; track line; let i = $index) {
                <tspan [attr.x]="mk.lx" [attr.dy]="i === 0 ? (mk.label.length > 1 ? '-0.1em' : '0.35em') : '1.05em'">{{ line }}</tspan>
              }
            </text>
            @if (valueOf(mk.key); as v) {
              <text class="val" [attr.transform]="mk.rot ? 'rotate(' + mk.rot + ' ' + mk.vx + ' ' + mk.vy + ')' : null" [attr.x]="mk.vx" [attr.y]="mk.vy" text-anchor="middle" dy="0.35em">{{ v }}</text>
            }
          </g>
        }
      </g>
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    .outline { fill: none; stroke: var(--c-ink); stroke-width: 1.5; stroke-linejoin: round; }
    .detail { fill: none; stroke: var(--c-ink-2); stroke-width: 1; }
    .shaft { fill: none; stroke: var(--c-ink-2); stroke-width: 1.3; }
    .heads { fill: var(--c-ink-2); stroke: none; }
    .ext { fill: none; stroke: var(--c-muted); stroke-width: 0.9; }
    text { font-family: var(--font-sans); font-size: 17px; paint-order: stroke; stroke: var(--c-surface); stroke-width: 6px; stroke-linejoin: round; }
    .name { font-weight: 500; fill: var(--c-ink); }
    .val { font-weight: 700; fill: var(--c-gold-dark); }
    .marker.empty .shaft { stroke: var(--c-faint); }
    .marker.empty .heads { fill: var(--c-faint); }
    .marker.empty .name { fill: var(--c-muted); font-weight: 400; }
    .marker.on .shaft { stroke: var(--c-gold-dark); stroke-width: 2.6; }
    .marker.on .heads { fill: var(--c-gold-dark); }
    .marker.on .ext { stroke: var(--c-gold-dark); }
    .marker.on .name { fill: var(--c-gold-dark); font-weight: 700; }
    .marker .shaft, .marker .heads, .marker .name { transition: stroke 0.15s ease, fill 0.15s ease; }
  `,
})
export class SizeDiagramComponent {
  readonly type = input.required<'shirt' | 'trouser'>();
  /** Measurements; when given (read-only views) each value is printed under its name. */
  readonly values = input<Partial<Record<string, number | null | undefined>> | null>(null);
  /** Key of the marker to highlight (the focused field). */
  readonly active = input<string | null>(null);

  protected outline = computed(() => (this.type() === 'shirt' ? SHIRT_OUTLINE : TROUSER_OUTLINE));
  protected detail = computed(() => (this.type() === 'shirt' ? SHIRT_DETAIL : TROUSER_DETAIL));
  protected markers = computed(() => (this.type() === 'shirt' ? SHIRT : TROUSER));
  protected viewBox = computed(() => (this.type() === 'shirt' ? '0 0 404 504' : '0 -16 360 564'));
  protected hasValues = computed(() => this.values() !== null);

  protected valueOf(key: string): string | null {
    const v = this.values()?.[key];
    return typeof v === 'number' ? `${v}″` : null;
  }
}
