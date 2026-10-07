import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { ConfigService } from '../core/services/config.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { copyText } from '../core/utils/image';

/**
 * "Ship your parcel to" card: our receiving address (GET /config) + the customer's name and code
 * to write on the parcel label, with a Copy button.
 */
@Component({
  selector: 'app-ship-to-card',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ship-card" [class.compact]="compact()" [attr.aria-label]="heading()">
      <div class="ship-head">
        <div class="titles">
          <span class="eyebrow">{{ eyebrow() }}</span>
          <h3>{{ heading() }}</h3>
        </div>
        @if (cfg()) {
          <button type="button" class="copy-btn" (click)="copy()" aria-label="Copy address and your customer code">
            <ion-icon [name]="copied() ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon>
            <span>{{ copied() ? 'Copied' : 'Copy' }}</span>
          </button>
        }
      </div>

      @if (cfg(); as c) {
        <address class="address">
          <strong>{{ c.shipToName }}</strong>
          <span>{{ c.shipToAddress }}</span>
          <span>{{ c.shipToCity }}</span>
          @if (c.shipToPhone) {
            <span class="phone"><ion-icon name="call-outline" aria-hidden="true"></ion-icon>{{ c.shipToPhone }}</span>
          }
        </address>
        <div class="label-note">
          <span class="label-k">Write this on the parcel label</span>
          <span class="label-v">
            <span class="who">{{ customerName() }}</span>
            <b class="mono">{{ code() }}</b>
          </span>
        </div>
        @if (!compact()) {
          <p class="explain">Use this as the delivery address when you buy from a brand's website.</p>
        }
      } @else if (config.error()) {
        <div class="form-error">
          <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
          <span>{{ config.error() }}</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="config.load(true)">Retry</button>
        </div>
      } @else {
        <div class="sk" aria-busy="true" aria-label="Loading address">
          <span class="skeleton" style="width: 60%; height: 13px"></span>
          <span class="skeleton" style="width: 85%; height: 11px"></span>
          <span class="skeleton" style="width: 40%; height: 11px"></span>
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .ship-card {
      background: linear-gradient(160deg, var(--c-brand) 0%, var(--c-brand-2) 100%);
      color: var(--c-on-dark); border-radius: 20px; padding: 18px; position: relative; overflow: hidden;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
    }
    .ship-card::after {
      content: ''; position: absolute; right: -40px; top: -40px; width: 140px; height: 140px; border-radius: 50%;
      border: 1px solid rgba(229, 192, 123, 0.22); pointer-events: none;
    }
    .ship-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .titles { min-width: 0; }
    .eyebrow { color: var(--c-gold-light); }
    h3 { font-family: var(--font-serif); font-size: 22px; font-weight: 700; line-height: 1.15; color: #fff; }
    .copy-btn {
      position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; flex: none;
      min-height: 44px; padding: 0 16px; border-radius: 999px;
      border: 1px solid rgba(229, 192, 123, 0.7); background: rgba(255, 255, 255, 0.08); color: #fff;
      font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
    }
    .copy-btn ion-icon { font-size: 17px; color: var(--c-gold-light); }
    .copy-btn:hover { background: rgba(255, 255, 255, 0.16); }
    .copy-btn:focus-visible { outline-color: var(--c-gold-light); }
    .address { display: flex; flex-direction: column; gap: 2px; font-style: normal; font-size: var(--fs-body); line-height: 1.45; color: var(--c-on-dark); }
    .address strong { font-size: var(--fs-body); color: #fff; }
    .phone { display: inline-flex; align-items: center; gap: 6px; margin-top: 2px; }
    .label-note {
      margin-top: 14px; padding: 12px 14px; border-radius: 14px;
      background: rgba(255, 255, 255, 0.08); border: 1.5px dashed rgba(229, 192, 123, 0.7);
      display: flex; flex-direction: column; gap: 4px;
    }
    .label-k { font-size: var(--fs-2xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--c-gold-light); font-weight: 600; }
    .label-v { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: var(--fs-body); color: #fff; }
    .label-v b { font-size: 18px; color: var(--c-gold-light); letter-spacing: 0.06em; }
    .explain { margin: 12px 0 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--c-on-dark-muted); }
    .sk { display: flex; flex-direction: column; gap: 8px; }
    .sk .skeleton { opacity: 0.25; }
    .form-error { color: #fff; background: rgba(163, 48, 31, 0.35); border-color: rgba(255,255,255,0.2); align-items: center; }
    .form-error .btn { --btn-fg: #fff; margin-left: auto; }
    .compact { padding: 16px; }
  `,
})
export class ShipToCardComponent {
  protected config = inject(ConfigService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private copiedTimer?: ReturnType<typeof setTimeout>;
  protected copied = signal(false);

  readonly eyebrow = input('Our receiving address');
  readonly heading = input('Ship your parcel to');
  readonly compact = input(false);

  protected cfg = this.config.config;
  protected customerName = computed(() => this.auth.user()?.full_name || this.auth.user()?.email || '');
  protected code = computed(() => this.auth.user()?.customer_code || '');

  constructor() {
    this.config.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  async copy(): Promise<void> {
    const c = this.cfg();
    if (!c) return;
    const text = [
      `${c.shipToName} — ${this.customerName()} (${this.code()})`,
      c.shipToAddress,
      c.shipToCity,
      c.shipToPhone ? `Phone: ${c.shipToPhone}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (await copyText(text)) {
      this.toast.success('Address and your customer code copied.');
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } else this.toast.error('Could not copy — please select the address manually.');
  }
}
