import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { ConfigService } from '../core/services/config.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { copyText } from '../core/utils/image';
import { PartnerChoiceService } from '../core/services/partner-choice.service';
import { ClientPartner } from '../core/models/api.models';

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
        @if (addr()) {
          <button type="button" class="copy-btn" (click)="copy()" aria-label="Copy address and your customer code">
            <ion-icon [name]="copied() ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon>
            <span>{{ copied() ? 'Copied' : 'Copy' }}</span>
          </button>
        }
      </div>

      @if (chooser() && partnerList().length > 1) {
        <div class="chooser" role="group" aria-label="Choose a stitching partner">
          @for (p of partnerList(); track p.id) {
            <button type="button" class="chip-p" [class.on]="p.id === selected()?.id" [attr.aria-pressed]="p.id === selected()?.id" (click)="pickPartner(p)">{{ p.name }}</button>
          }
        </div>
      }

      @if (addr(); as c) {
        @if (selected(); as sp) {
          <div class="who-line"><span class="who-ico" aria-hidden="true"><ion-icon name="cut-outline"></ion-icon></span>For orders stitched by <b>{{ sp.name }}</b>@if (sp.city) { <span class="who-city">· {{ sp.city }}</span> }</div>
        }
        <address class="address">
          <strong>{{ c.name }}</strong>
          <span>{{ c.address }}</span>
          <span>{{ c.city }}</span>
          @if (c.phone) {
            <span class="phone"><ion-icon name="call-outline" aria-hidden="true"></ion-icon>{{ c.phone }}</span>
          }
        </address>
        <div class="label-note">
          <span class="label-k">Write this on the parcel label</span>
          <span class="label-v">
            <span class="who">{{ customerName() }}</span>
            <b class="mono">{{ labelCode() }}</b>
          </span>
        </div>
        @if (!compact()) {
          <p class="explain">Use this as the delivery address when you buy from a brand's website.</p>
        }
      } @else if (config.error() && !partnerList().length) {
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
      background: var(--c-brand-fill, linear-gradient(160deg, var(--c-brand) 0%, var(--c-brand-2) 100%));
      color: var(--c-on-brand, #fff); border-radius: 20px; padding: 18px; position: relative; overflow: hidden;
      box-shadow: 0 10px 26px var(--c-brand-glow);
    }
    .ship-card::after {
      content: ''; position: absolute; right: -40px; top: -40px; width: 140px; height: 140px; border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.08); pointer-events: none;
    }
    .ship-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .titles { min-width: 0; }
    .eyebrow { color: var(--c-on-brand, #fff); opacity: 0.7; }
    h3 { font-family: var(--font-serif); font-size: 22px; font-weight: 700; line-height: 1.15; color: #fff; }
    .copy-btn {
      position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; flex: none;
      min-height: 44px; padding: 0 16px; border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(255, 255, 255, 0.12); color: #fff;
      font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    .copy-btn ion-icon { font-size: 17px; color: inherit; }
    .copy-btn:hover { background: rgba(255, 255, 255, 0.2); border-color: rgba(255, 255, 255, 0.4); }
    .copy-btn:focus-visible { outline-color: #fff; }
    .chooser { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; position: relative; z-index: 1; }
    .chip-p { padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.28); background: rgba(255,255,255,0.1); color: inherit; font: inherit; font-size: var(--fs-xs); font-weight: 600; cursor: pointer; }
    .chip-p.on { background: #fff; color: var(--c-brand); border-color: #fff; }
    .who-line { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: var(--fs-sm); opacity: 0.9; }
    .who-ico { width: 22px; height: 22px; border-radius: 7px; background: rgba(255,255,255,0.16); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    .who-city { opacity: 0.8; }
    .address { display: flex; flex-direction: column; gap: 2px; font-style: normal; font-size: var(--fs-body); line-height: 1.45; color: var(--c-on-dark); }
    .address strong { font-size: var(--fs-body); color: #fff; }
    .phone { display: inline-flex; align-items: center; gap: 6px; margin-top: 2px; }
    .label-note {
      margin-top: 14px; padding: 12px 14px; border-radius: 14px;
      background: rgba(255, 255, 255, 0.06); border: 1.5px dashed rgba(255, 255, 255, 0.25);
      display: flex; flex-direction: column; gap: 4px;
    }
    .label-k { font-size: var(--fs-2xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--c-on-brand, #fff); opacity: 0.7; font-weight: 600; }
    .label-v { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: var(--fs-body); color: #fff; }
    .label-v b { font-size: 18px; color: #fff; letter-spacing: 0.06em; }
    .explain { margin: 12px 0 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--c-on-brand, #fff); opacity: 0.8; }
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
  /** The partner whose address to show (an order's partner). Without it the customer's chosen / recommended partner is used. */
  readonly partner = input<ClientPartner | null>(null);
  /** Let the customer switch between partners (profile page). */
  readonly chooser = input(false);
  private choice = inject(PartnerChoiceService);
  private picked = signal<string | null>(null);
  protected partnerList = this.choice.partners;

  protected cfg = this.config.config;
  protected selected = computed<ClientPartner | null>(() => {
    const fixed = this.partner();
    if (fixed) return fixed;
    const list = this.choice.partners();
    return list.find((p) => p.id === this.picked()) ?? this.choice.defaultPartner();
  });
  /** The address to show: the partner's own, else the platform's default receiving address. */
  protected addr = computed(() => {
    const p = this.selected();
    if (p && p.receiving.address) return p.receiving;
    const c = this.cfg();
    return c ? { name: c.shipToName, address: c.shipToAddress, city: c.shipToCity, phone: c.shipToPhone } : p ? p.receiving : null;
  });
  protected labelCode = computed(() => {
    const p = this.selected();
    return p?.short_code ? `${this.code()} · ${p.short_code}` : this.code();
  });

  protected pickPartner(p: ClientPartner): void {
    this.picked.set(p.id);
    this.choice.remember(p.id);
  }
  protected customerName = computed(() => this.auth.user()?.full_name || this.auth.user()?.email || '');
  protected code = computed(() => this.auth.user()?.customer_code || '');

  constructor() {
    this.config.load();
    this.choice.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  async copy(): Promise<void> {
    const c = this.addr();
    if (!c) return;
    const text = [
      `${c.name} — ${this.customerName()} (${this.labelCode()})`,
      c.address,
      c.city,
      c.phone ? `Phone: ${c.phone}` : '',
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
