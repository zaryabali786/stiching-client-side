import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import * as QRCode from 'qrcode';

/** A scannable QR code drawn as inline SVG, with the text underneath when `showText` is on. */
@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + (qr().size + 8) + ' ' + (qr().size + 8)" [style.width.px]="size()" [style.height.px]="size()" shape-rendering="crispEdges" role="img" [attr.aria-label]="'QR code ' + value()">
      <rect width="100%" height="100%" fill="#fff" />
      <path [attr.d]="qr().path" transform="translate(4 4)" fill="#000" />
    </svg>
    @if (showText()) { <span class="txt">{{ value() }}</span> }
  `,
  styles: `
    :host { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
    svg { display: block; border-radius: 8px; border: 1px solid var(--c-line); background: #fff; }
    .txt { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.04em; color: var(--c-ink); }
  `,
})
export class QrCodeComponent {
  readonly value = input.required<string>();
  readonly size = input(72);
  readonly showText = input(false);

  protected qr = computed(() => {
    const { modules } = QRCode.create(this.value(), { errorCorrectionLevel: 'M' });
    const n = modules.size;
    let path = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.get(y, x)) path += `M${x} ${y}h1v1h-1z`;
    return { size: n, path };
  });
}
