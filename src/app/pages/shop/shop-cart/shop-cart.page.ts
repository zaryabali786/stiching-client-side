import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ShopService, money } from '../../../core/services/shop.service';
import { ToastService } from '../../../core/services/toast.service';
import { ShopAddress, ShopCart, ShopCartItem, ShopCheckoutResult } from '../../../core/models/shop.models';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';
import { PaymentSheetComponent } from '../../../shared/payment-sheet.component';

const COUNTRIES = ['PK', 'US', 'GB', 'AE', 'SA', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'IE', 'QA', 'KW', 'BH', 'OM', 'TR', 'MY', 'SG', 'IN', 'BD', 'NZ', 'ZA', 'EG'];

@Component({
  selector: 'app-shop-cart',
  imports: [FormsModule, RouterLink, IonIcon, IonSpinner, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, PaymentSheetComponent],
  styleUrl: '../shop.shared.scss',
  styles: `
    .qty { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--c-line); border-radius: 999px; padding: 2px; }
    .qty button { width: 30px; height: 30px; border-radius: 50%; border: 0; background: transparent; color: var(--c-ink); }
    .qty button:disabled { opacity: 0.35; }
    .qty span { min-width: 24px; text-align: center; font-weight: 700; font-size: var(--fs-sm); }
    .line-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; }
    .rm { border: 0; background: transparent; color: var(--c-muted); display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-xs); font-weight: 600; }
    .group-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .group-head h3 { margin: 0; font-size: var(--fs-md, 16px); }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form .full { grid-column: 1 / -1; }
    .sticky { position: sticky; bottom: 0; padding: 10px 0 4px; background: linear-gradient(to top, var(--c-bg) 70%, transparent); }
    .back { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: var(--fs-sm); color: var(--c-muted); text-decoration: none; border: 0; background: transparent; padding: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="title-row">
        <div>
          <span class="eyebrow">{{ step() === 'cart' ? 'Your cart' : 'Delivery' }}</span>
          <h1 class="page-title">{{ step() === 'cart' ? 'Cart' : 'Checkout' }}</h1>
        </div>
        @if (step() === 'cart') {
          <a class="btn btn-outline btn-sm" routerLink="/app/shop">Keep shopping</a>
        } @else {
          <button type="button" class="back" (click)="step.set('cart')"><ion-icon name="chevron-back-outline" aria-hidden="true"></ion-icon> Cart</button>
        }
      </header>

      @if (loading() && !cart()) {
        <app-skeleton variant="cards" [count]="2" />
      } @else if (error() && !cart()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (cart(); as c) {
        @if (c.items.length === 0) {
          <app-empty-state icon="cart-outline" title="Your cart is empty" message="Add products from our brands and they will show up here.">
            <a class="btn btn-primary btn-sm" routerLink="/app/shop">Browse the Shop</a>
          </app-empty-state>
        } @else {
          @for (n of c.notices; track n) {
            <p class="notice warn"><ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon><span>{{ n }}</span></p>
          }
          @if (message()) {
            <p class="notice warn" role="alert"><ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon><span>{{ message() }}</span></p>
          }

          @if (step() === 'cart') {
            @for (g of c.groups; track g.brand.id) {
              <section class="panel" [attr.aria-label]="g.brand.name">
                <div class="group-head">
                  <h3>{{ g.brand.name }}</h3>
                  <span class="muted small">Fulfilled by {{ g.brand.name }}</span>
                </div>
                @for (i of itemsOf(c, g.brand.id); track i.variant_id) {
                  <div class="line">
                    <a class="thumb" [routerLink]="['/app/shop/product', i.product_id]">
                      @if (i.image_url) {
                        <img [src]="i.image_url" [alt]="i.title" loading="lazy" />
                      } @else {
                        <ion-icon name="image-outline" aria-hidden="true"></ion-icon>
                      }
                    </a>
                    <div class="info">
                      <a class="t" style="color: inherit; text-decoration: none" [routerLink]="['/app/shop/product', i.product_id]">{{ i.title }}</a>
                      @if (i.variant_title && i.variant_title !== 'Default Title') {
                        <span class="muted small">{{ i.variant_title }}</span>
                      }
                      @if (i.issue) {
                        <span class="pill" data-tone="bad">{{ i.issue }}</span>
                      } @else if (!i.available) {
                        <span class="pill" data-tone="bad">No longer available</span>
                      }
                      <div class="line-foot">
                        <div class="qty" role="group" [attr.aria-label]="'Quantity of ' + i.title">
                          <button type="button" (click)="change(i, i.quantity - 1)" [disabled]="busy() === i.variant_id || i.quantity <= 1" aria-label="Fewer"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon></button>
                          <span class="tabular">{{ i.quantity }}</span>
                          <button type="button" (click)="change(i, i.quantity + 1)" [disabled]="busy() === i.variant_id || !i.available" aria-label="More"><ion-icon name="add-outline" aria-hidden="true"></ion-icon></button>
                        </div>
                        <strong class="tabular">{{ fmt(i.line_total) }}</strong>
                      </div>
                      <button type="button" class="rm" (click)="remove(i)" [disabled]="busy() === i.variant_id"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> Remove</button>
                    </div>
                  </div>
                }
                <div class="totals">
                  <div class="r"><span class="muted">Items</span><span class="tabular">{{ fmt(g.subtotal) }}</span></div>
                  <div class="r"><span class="muted">Delivery by {{ g.brand.name }}</span><span class="tabular">{{ g.shipping > 0 ? fmt(g.shipping) : 'Free' }}</span></div>
                </div>
              </section>
            }
          } @else {
            <section class="panel">
              <h3 style="margin: 0">Where should it be delivered?</h3>
              <form class="form" (ngSubmit)="submit()" #f="ngForm" novalidate>
                <div class="field full"><label for="s-name">Full name</label><input id="s-name" class="input" name="name" autocomplete="name" [(ngModel)]="address.name" required /></div>
                <div class="field full"><label for="s-phone">Phone</label><input id="s-phone" class="input" name="phone" type="tel" autocomplete="tel" [(ngModel)]="address.phone" required /></div>
                <div class="field full"><label for="s-a1">Address</label><input id="s-a1" class="input" name="address1" autocomplete="address-line1" [(ngModel)]="address.address1" required /></div>
                <div class="field full"><label for="s-a2">Apartment, suite (optional)</label><input id="s-a2" class="input" name="address2" autocomplete="address-line2" [(ngModel)]="address.address2" /></div>
                <div class="field"><label for="s-city">City</label><input id="s-city" class="input" name="city" autocomplete="address-level2" [(ngModel)]="address.city" required /></div>
                <div class="field"><label for="s-prov">State / province</label><input id="s-prov" class="input" name="province" autocomplete="address-level1" [(ngModel)]="address.province" /></div>
                <div class="field"><label for="s-zip">Postcode</label><input id="s-zip" class="input" name="zip" autocomplete="postal-code" [(ngModel)]="address.zip" /></div>
                <div class="field">
                  <label for="s-cc">Country</label>
                  <select id="s-cc" class="input" name="country_code" [(ngModel)]="address.country_code" required>
                    @for (cc of countries; track cc.code) {
                      <option [value]="cc.code">{{ cc.name }}</option>
                    }
                  </select>
                </div>
              </form>
              @if (formError()) {
                <div class="form-error" role="alert"><ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon><span>{{ formError() }}</span></div>
              }
            </section>
          }

          <section class="panel">
            <div class="totals">
              <div class="r"><span class="muted">Items</span><span class="tabular">{{ fmt(c.subtotal) }}</span></div>
              <div class="r"><span class="muted">Delivery</span><span class="tabular">{{ c.shipping_total > 0 ? fmt(c.shipping_total) : 'Free' }}</span></div>
              @if (c.discount_total > 0) {
                <div class="r"><span class="muted">Discounts</span><span class="tabular">-{{ fmt(c.discount_total) }}</span></div>
              }
              @if (c.tax_total > 0) {
                <div class="r"><span class="muted">Taxes</span><span class="tabular">{{ fmt(c.tax_total) }}</span></div>
              }
              <div class="r big"><span>Total</span><span class="tabular">{{ fmt(c.total) }}</span></div>
            </div>
            <p class="notice"><ion-icon name="storefront-outline" aria-hidden="true"></ion-icon><span>{{ c.disclosure || 'Each item is fulfilled and shipped by its own brand. Items from different brands arrive in separate parcels. You pay once, here.' }}</span></p>
          </section>

          <div class="sticky">
            @if (step() === 'cart') {
              <button type="button" class="btn btn-primary btn-block" (click)="toAddress()" [disabled]="!c.can_checkout || !!busy()">Continue to delivery</button>
            } @else {
              <button type="button" class="btn btn-primary btn-block" (click)="submit()" [disabled]="paying()">
                @if (paying()) {
                  <ion-spinner name="crescent"></ion-spinner> Checking your items…
                } @else {
                  <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon> Pay {{ fmt(c.total) }}
                }
              </button>
            }
          </div>
        }
      }
    </div>

    @if (placed(); as p) {
      <app-payment-sheet kind="shop" [open]="payOpen()" [orderId]="p.order.id" [reference]="p.order.reference" [amountLabel]="fmtOrder(p)" (paid)="onPaid(p)" (closed)="onClosed(p)" />
    }
  `,
})
export class ShopCartPage {
  private shop = inject(ShopService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly countries = COUNTRIES.map((code) => ({ code, name: this.countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));

  cart = this.shop.cart;
  loading = signal(true);
  error = signal<string | null>(null);
  message = signal<string | null>(null);
  step = signal<'cart' | 'address'>('cart');
  busy = signal<string | null>(null);
  paying = signal(false);
  formError = signal<string | null>(null);
  placed = signal<ShopCheckoutResult | null>(null);
  payOpen = signal(false);

  address: ShopAddress = { name: '', phone: '', address1: '', address2: '', city: '', province: '', zip: '', country_code: 'PK' };

  currency = computed(() => this.cart()?.currency ?? '');

  constructor() {
    const u = this.auth.user();
    if (u) {
      this.address.name = u.full_name ?? '';
      this.address.phone = u.phone ?? '';
      this.address.address1 = u.address ?? '';
      this.address.city = u.city ?? '';
      this.address.zip = u.postal_code ?? '';
      const code = this.countries.find((c) => c.name.toLowerCase() === (u.country ?? '').toLowerCase() || c.code === (u.country ?? '').toUpperCase());
      if (code) this.address.country_code = code.code;
    }
    this.load();
  }

  private countryName(code: string): string {
    try {
      return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  }

  fmt(n: number): string {
    return money(n, this.currency());
  }

  fmtOrder(p: ShopCheckoutResult): string {
    return money(p.order.total, p.order.currency);
  }

  itemsOf(c: ShopCart, brandId: string): ShopCartItem[] {
    return c.items.filter((i) => i.brand.id === brandId);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.shop.loadCart().subscribe({
      next: () => this.loading.set(false),
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  change(i: ShopCartItem, quantity: number): void {
    if (quantity < 1) return;
    this.busy.set(i.variant_id);
    this.message.set(null);
    this.shop.setItem(i.variant_id, quantity).subscribe({
      next: () => this.busy.set(null),
      error: (err: Error) => {
        this.busy.set(null);
        this.message.set(err.message);
      },
    });
  }

  remove(i: ShopCartItem): void {
    this.busy.set(i.variant_id);
    this.message.set(null);
    this.shop.removeItem(i.variant_id).subscribe({
      next: () => this.busy.set(null),
      error: (err: Error) => {
        this.busy.set(null);
        this.message.set(err.message);
      },
    });
  }

  toAddress(): void {
    this.message.set(null);
    this.step.set('address');
  }

  submit(): void {
    const a = this.address;
    this.formError.set(null);
    if (!a.name.trim() || !a.phone.trim() || !a.address1.trim() || !a.city.trim() || !a.country_code) {
      this.formError.set('Please fill in your name, phone, address, city and country.');
      return;
    }
    if (this.paying()) return;
    this.paying.set(true);
    this.message.set(null);
    this.shop.checkout({ ...a, address2: a.address2?.trim() || undefined, province: a.province?.trim() || undefined, zip: a.zip?.trim() || undefined }, this.auth.user()?.email).subscribe({
      next: ({ data }) => {
        this.paying.set(false);
        this.placed.set(data);
        this.payOpen.set(true);
      },
      error: (err: Error) => {
        this.paying.set(false);
        // prices or stock changed: the server updated the cart, show it again with the reason
        this.message.set(err.message);
        this.step.set('cart');
        this.load();
      },
    });
  }

  onPaid(p: ShopCheckoutResult): void {
    this.payOpen.set(false);
    this.shop.cart.set(null);
    this.toast.success('Order placed. Thank you!');
    this.router.navigate(['/app/shop/orders', p.order.id]);
  }

  /** The sheet was closed without paying: the order exists and waits for payment on its own page. */
  onClosed(p: ShopCheckoutResult): void {
    this.payOpen.set(false);
    this.router.navigate(['/app/shop/orders', p.order.id]);
  }
}
