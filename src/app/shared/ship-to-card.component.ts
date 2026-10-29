import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { ConfigService } from '../core/services/config.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { copyText } from '../core/utils/image';
import { ClientPartner } from '../core/models/api.models';

/**
 * "Ship your parcel to" card: our receiving address (GET /config) with Copy buttons.
 */
@Component({
  selector: 'app-ship-to-card',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ship-card" [class.compact]="compact()" [class.light]="light()" [attr.aria-label]="heading() + (brandLine() ? ' ' + brandLine() : '')">
      <div class="ship-head">
        <div class="titles">
          @if (!light()) { <span class="eyebrow">{{ eyebrow() }}</span> }
          <h3>{{ heading() }}@if (brandLine()) { <span class="brand-line">{{ brandLine() }}</span> }</h3>
        </div>
        @if (addr()) {
          <button type="button" class="copy-btn" (click)="copy()" aria-label="Copy the whole address">
            <ion-icon [name]="copied() ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon>
            <span>{{ copied() ? 'Copied' : 'Copy all' }}</span>
          </button>
        }
      </div>

      @if (addr(); as c) {
        <dl class="rows">
          @if (rowName(c.name); as n) {
            <div class="row"><dt>Name</dt><dd>{{ n }}</dd>
              <button type="button" class="mini" (click)="copyOne('name', n)" aria-label="Copy name"><ion-icon [name]="done() === 'name' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          }
          @if (showEmail() && email(); as mail) {
            <div class="row"><dt>Email</dt><dd class="mono-dd">{{ mail }}</dd>
              <button type="button" class="mini" (click)="copyOne('email', mail)" aria-label="Copy your assigned shopping email"><ion-icon [name]="done() === 'email' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          }
          @if (c.phone) {
            <div class="row"><dt>Number</dt><dd>{{ c.phone }}</dd>
              <button type="button" class="mini" (click)="copyOne('phone', c.phone)" aria-label="Copy phone number"><ion-icon [name]="done() === 'phone' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          }
          <div class="row"><dt>{{ light() ? 'Article address' : 'Address' }}</dt><dd>{{ c.address }}</dd>
              <button type="button" class="mini" (click)="copyOne('address', c.address)" aria-label="Copy street address"><ion-icon [name]="done() === 'address' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          @if (c.address2; as v) {
            <div class="row"><dt>Apartment</dt><dd>{{ v }}</dd>
              <button type="button" class="mini" (click)="copyOne('address2', v)" aria-label="Copy apartment or suite"><ion-icon [name]="done() === 'address2' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          }
          <div class="row"><dt>City</dt><dd>{{ c.city }}</dd>
              <button type="button" class="mini" (click)="copyOne('city', c.city)" aria-label="Copy city"><ion-icon [name]="done() === 'city' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          @if (c.state; as v) {
            <div class="row"><dt>State</dt><dd>{{ v }}</dd>
              <button type="button" class="mini" (click)="copyOne('state', v)" aria-label="Copy state or province"><ion-icon [name]="done() === 'state' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          }
          @if (c.zip; as v) {
            <div class="row"><dt>Postal code</dt><dd>{{ v }}</dd>
              <button type="button" class="mini" (click)="copyOne('zip', v)" aria-label="Copy postal code"><ion-icon [name]="done() === 'zip' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          }
          @if (c.country; as v) {
            <div class="row"><dt>Country</dt><dd>{{ v }}</dd>
              <button type="button" class="mini" (click)="copyOne('country', v)" aria-label="Copy country"><ion-icon [name]="done() === 'country' ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon></button></div>
          }
        </dl>
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
    .rows { margin: 0; display: flex; flex-direction: column; gap: 6px; position: relative; z-index: 1; }
    .row { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border-radius: 12px; background: rgba(255, 255, 255, 0.07); }
    .row dt { white-space: nowrap; font-size: var(--fs-2xs); letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.65; font-weight: 600; }
    .row dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: #fff; font-size: var(--fs-body); line-height: 1.35; }
    .mono-dd { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
    .mini { flex: none; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.22); background: rgba(255, 255, 255, 0.1); color: #fff; cursor: pointer; }
    .mini ion-icon { font-size: 16px; color: inherit; }
    .mini:hover { background: rgba(255, 255, 255, 0.22); }
    .mini:focus-visible { outline-color: #fff; }
    .address { display: flex; flex-direction: column; gap: 2px; font-style: normal; font-size: var(--fs-body); line-height: 1.45; color: var(--c-on-dark); }
    .address strong { font-size: var(--fs-body); color: #fff; }
    .phone { display: inline-flex; align-items: center; gap: 6px; margin-top: 2px; }
    .explain { margin: 12px 0 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--c-on-brand, #fff); opacity: 0.8; }
    .sk { display: flex; flex-direction: column; gap: 8px; }
    .sk .skeleton { opacity: 0.25; }
    .form-error { color: #fff; background: rgba(163, 48, 31, 0.35); border-color: rgba(255,255,255,0.2); align-items: center; }
    .form-error .btn { --btn-fg: #fff; margin-left: auto; }
    .compact { padding: 16px; }

    /* ── light look (new order / edit order): white card, rows with a thin line, round outlined copy buttons ── */
    .ship-card.light { background: #fff; color: #1f2937; border: 0; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 22px -10px rgba(15, 23, 42, 0.2); padding: 20px 18px 18px; }
    .ship-card.light::after { display: none; }
    .light .ship-head { align-items: center; margin-bottom: 14px; }
    .light h3 { font-family: var(--font-sans); font-size: var(--fs-lg, 17px); font-weight: 500; line-height: 1.25; color: #1f2937; }
    .light .brand-line { display: block; color: #62003E; font-weight: 600; }
    .light .copy-btn { min-height: 38px; padding: 0 16px; border: 1px solid #E4E4E7; background: #fff; color: #27272a; font-weight: 500; }
    .light .copy-btn:hover { background: #FBF3F8; border-color: #62003E; }
    .light .copy-btn ion-icon { display: none; }
    .light .copy-btn:focus-visible { outline: 2px solid #62003E; outline-offset: 2px; }
    .light .rows { gap: 8px; }
    .light .row { grid-template-columns: 104px minmax(0, 1fr) auto; padding: 6px 7px 6px 14px; border: 1px solid #E8E8EC; background: #fff; border-radius: 14px; min-height: 48px; }
    .light .row dt { white-space: nowrap; font-size: var(--fs-xs); letter-spacing: 0; text-transform: none; font-weight: 500; opacity: 1; color: #6b7280; }
    .light .row dd { color: #1f2937; font-size: var(--fs-md); font-weight: 500; }
    .light .mini { width: 34px; height: 34px; border: 1px solid #D4D4D8; background: #fff; color: #3f3f46; }
    .light .mini:hover { background: #FBF3F8; border-color: #62003E; color: #62003E; }
    .light .mini:focus-visible { outline: 2px solid #62003E; outline-offset: 2px; }
    .light .explain { color: #6b7280; opacity: 1; }
    .light .form-error { color: #b42318; background: #fef3f2; border-color: #fecdca; }
    .light .form-error .btn { --btn-fg: #b42318; }
    .light .sk .skeleton { opacity: 0.6; }
  `,
})
export class ShipToCardComponent {
  protected config = inject(ConfigService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private copiedTimer?: ReturnType<typeof setTimeout>;
  protected copied = signal(false);
  /** Which single field was copied last (its button shows a tick for a moment). */
  protected done = signal<string | null>(null);
  private doneTimer?: ReturnType<typeof setTimeout>;

  readonly eyebrow = input('Our receiving address');
  readonly heading = input('Ship your parcel to');
  /** A second line under the heading, in the brand colour (the order form: "Stitch & Ship"). */
  readonly brandLine = input('');
  /** White card with dark text (the new order and edit order screens) instead of the dark brand card. */
  readonly light = input(false);
  readonly compact = input(false);
  /** Also show the customer's assigned shopping email (the profile page does). */
  readonly showEmail = input(false);
  protected email = computed(() => this.auth.user()?.mailbox_address ?? '');
  /** The partner whose address to show, once the admin assigned the order to one. Without it the parcel goes to our central address. */
  readonly partner = input<ClientPartner | null>(null);

  protected cfg = this.config.config;
  protected selected = computed<ClientPartner | null>(() => this.partner());
  /** The address to show: the partner's own, else the platform's default receiving address. */
  protected addr = computed(() => {
    const p = this.selected();
    if (p && p.receiving.address) return { ...p.receiving, address2: '', state: '', zip: '', country: '' };
    const c = this.cfg();
    // the platform's address carries every line the admin saved (apartment, state, postal code, country); a partner's own address has none of them
    return c
      ? { name: c.shipToName, address: c.shipToAddress, city: c.shipToCity, phone: c.shipToPhone, address2: c.shipToAddress2 ?? '', state: c.shipToState ?? '', zip: c.shipToZip ?? '', country: c.shipToCountry ?? '' }
      : p ? { ...p.receiving, address2: '', state: '', zip: '', country: '' } : null;
  });

  /** The generic "admin" login name is not a receiver name: only a real name (a partner's) is printed. */
  protected nameOf(name: string | null | undefined): string {
    const n = (name ?? '').trim();
    return /^admin$/i.test(n) ? '' : n;
  }

  /** The Name row: the receiver's name when the partner set one, else the customer's own name. */
  protected rowName(name: string | null | undefined): string {
    return this.nameOf(name) || this.customerName();
  }

  protected customerName = computed(() => this.auth.user()?.full_name || this.auth.user()?.email || '');
  protected code = computed(() => this.auth.user()?.customer_code || '');

  constructor() {
    this.config.load();
    inject(DestroyRef).onDestroy(() => { clearTimeout(this.copiedTimer); clearTimeout(this.doneTimer); });
  }

  async copyOne(key: string, text: string): Promise<void> {
    if (!text) return;
    if (await copyText(text)) {
      this.done.set(key);
      clearTimeout(this.doneTimer);
      this.doneTimer = setTimeout(() => this.done.set(null), 1600);
    } else this.toast.error('Could not copy — please select the text manually.');
  }

  async copy(): Promise<void> {
    const c = this.addr();
    if (!c) return;
    const text = [
      this.rowName(c.name) ? `Name: ${this.rowName(c.name)}` : '',
      this.showEmail() && this.email() ? `Email: ${this.email()}` : '',
      c.phone ? `Number: ${c.phone}` : '',
      `Address: ${c.address}`,
      c.address2 ? `Apartment: ${c.address2}` : '',
      `City: ${c.city}`,
      c.state ? `State: ${c.state}` : '',
      c.zip ? `Postal code: ${c.zip}` : '',
      c.country ? `Country: ${c.country}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (await copyText(text)) {
      this.toast.success('Address copied.');
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } else this.toast.error('Could not copy — please select the address manually.');
  }
}
