import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { humanizeStatus, statusTone } from '../core/utils/order-status';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'status-badge tone-' + tone()">{{ text() }}</span>`,
  styles: `:host { display: inline-flex; flex: none; }`,
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  readonly label = input<string | null | undefined>(null);
  protected tone = computed(() => statusTone(this.status()));
  protected text = computed(() => this.label() || humanizeStatus(this.status()));
}

/** Stable brand colour + initial for an order tile. */
export function brandSwatch(brand: string | null | undefined): { cls: string; initial: string } {
  const name = (brand || '?').trim();
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { cls: `b${hash % 6}`, initial: name.charAt(0).toUpperCase() };
}
