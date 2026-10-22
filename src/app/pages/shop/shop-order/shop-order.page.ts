import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { ShopService, money } from '../../../core/services/shop.service';
import { ShopBrandOrder, ShopOrderDetail, ShopOrderStatus } from '../../../core/models/shop.models';
import { ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';
import { PaymentSheetComponent } from '../../../shared/payment-sheet.component';

export function shopTone(status: ShopOrderStatus): 'ok' | 'info' | 'warn' | 'bad' | '' {
  switch (status) {
    case 'delivered':
    case 'dispatched':
    case 'confirmed':
      return 'ok';
    case 'partially_dispatched':
    case 'processing':
      return 'info';
    case 'pending_payment':
      return 'warn';
    case 'payment_failed':
    case 'cancelled':
    case 'attention':
      return 'bad';
    default:
      return '';
  }
}

@Component({
  selector: 'app-shop-order',
  imports: [RouterLink, DatePipe, IonIcon, SkeletonComponent, ErrorStateComponent, PaymentSheetComponent],
  styleUrl: '../shop.shared.scss',
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: var(--fs-sm); color: var(--c-muted); text-decoration: none; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .head h1 { margin: 0; font-size: 22px; }
    .bo-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .bo-head h3 { margin: 0; }
    .steps { display: flex; gap: 6px; flex-wrap: wrap; }
    .track { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm); }
    .track a { color: var(--c-accent, #0f392b); font-weight: 600; }
    .tl { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .tl li { display: flex; gap: 10px; font-size: var(--fs-sm); }
    .tl .d { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--c-line); margin-top: 6px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a class="back" routerLink="/app/shop/orders"><ion-icon name="chevron-back-outline" aria-hidden="true"></ion-icon> Shop orders</a>

      @if (loading() && !order()) {
        <app-skeleton variant="cards" [count]="2" />
      } @else if (error() && !order()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (order(); as o) {
        <div class="head">
          <div>
            <span class="eyebrow">Shop order</span>
            <h1>{{ o.reference }}</h1>
            <span class="muted small">{{ o.created_at | date: 'd MMM y, HH:mm' }}</span>
          </div>
          <span class="pill" [attr.data-tone]="tone(o.status)">{{ o.status_label }}</span>
        </div>

        @if (o.payment_status === 'unpaid' || o.payment_status === 'failed') {
          <section class="panel">
            <p class="notice warn" role="alert"><ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon><span>{{ o.payment_status === 'failed' ? 'Your last payment did not go through.' : 'This order is waiting for your payment.' }} Nothing is sent to the brands until it is paid.</span></p>
            <button type="button" class="btn btn-primary btn-block" (click)="payOpen.set(true)">Pay {{ fmt(o.total, o.currency) }}</button>
          </section>
        }
        @if (o.status === 'attention') {
          <p class="notice warn"><ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon><span>One of the brands could not take its part of your order yet. Our team has been told and is sorting it out. You do not need to pay again.</span></p>
        }

        @for (b of o.brand_orders; track b.id) {
          <section class="panel">
            <div class="bo-head">
              <h3>{{ b.brand.name }}</h3>
              <div class="steps">
                <span class="pill" [attr.data-tone]="boTone(b)">{{ b.status_label }}</span>
              </div>
            </div>
            <span class="muted small">Fulfilled and shipped by {{ b.brand.name }}</span>
            @for (i of b.items; track $index) {
              <div class="line">
                <span class="thumb">
                  @if (i.image_url) {
                    <img [src]="i.image_url" [alt]="i.title" loading="lazy" />
                  } @else {
                    <ion-icon name="image-outline" aria-hidden="true"></ion-icon>
                  }
                </span>
                <div class="info">
                  <span class="t">{{ i.title }}</span>
                  @if (i.variant_title && i.variant_title !== 'Default Title') {
                    <span class="muted small">{{ i.variant_title }}</span>
                  }
                  <span class="muted small tabular">{{ i.quantity }} × {{ fmt(i.unit_price, o.currency) }}</span>
                </div>
              </div>
            }
            @if (b.tracking.length) {
              <div class="track">
                @for (t of b.tracking; track $index) {
                  <span>
                    <ion-icon name="paper-plane-outline" aria-hidden="true"></ion-icon>
                    {{ t.company || 'Courier' }}{{ t.number ? ' · ' + t.number : '' }}
                    @if (t.url) {
                      · <a [href]="t.url" target="_blank" rel="noopener noreferrer">Track parcel</a>
                    }
                  </span>
                }
              </div>
            }
            @if ((b.fulfillment_status === 'dispatched' || b.fulfillment_status === 'partial') && !b.delivery_verified) {
              <span class="muted small">Sent by the brand. Delivery has not been confirmed yet.</span>
            }
            <div class="totals">
              <div class="r"><span class="muted">Items</span><span class="tabular">{{ fmt(b.subtotal, o.currency) }}</span></div>
              <div class="r"><span class="muted">Delivery</span><span class="tabular">{{ b.shipping > 0 ? fmt(b.shipping, o.currency) : 'Free' }}</span></div>
            </div>
          </section>
        }

        <section class="panel">
          <div class="totals">
            <div class="r big"><span>Total paid to us</span><span class="tabular">{{ fmt(o.total, o.currency) }}</span></div>
          </div>
          @if (o.address; as a) {
            <div class="small">
              <strong>Delivery address</strong><br />
              {{ a.name }}<br />
              {{ a.address1 }}{{ a.address2 ? ', ' + a.address2 : '' }}<br />
              {{ a.city }}{{ a.province ? ', ' + a.province : '' }} {{ a.zip }}<br />
              {{ a.country_code }} · {{ a.phone }}
            </div>
          }
        </section>

        @if (o.timeline.length) {
          <section class="panel">
            <h3 style="margin: 0">Progress</h3>
            <ul class="tl">
              @for (t of o.timeline; track $index) {
                <li><span class="d"></span><span>{{ t.text }}<br /><span class="muted small">{{ t.at | date: 'd MMM, HH:mm' }}</span></span></li>
              }
            </ul>
          </section>
        }

        <app-payment-sheet kind="shop" [open]="payOpen()" [orderId]="o.id" [reference]="o.reference" [amountLabel]="fmt(o.total, o.currency)" (paid)="onPaid()" (closed)="payOpen.set(false); load(true)" />
      }
    </div>
  `,
})
export class ShopOrderPage {
  private shop = inject(ShopService);

  readonly id = input<string>('');

  order = signal<ShopOrderDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  payOpen = signal(false);
  tone = shopTone;

  hasOrder = computed(() => !!this.order());

  constructor() {
    queueMicrotask(() => this.load());
  }

  fmt(n: number, currency: string): string {
    return money(n, currency);
  }

  boTone(b: ShopBrandOrder): 'ok' | 'info' | 'warn' | 'bad' | '' {
    if (b.state === 'failed' || b.state === 'cancelled') return 'bad';
    if (b.fulfillment_status === 'delivered') return 'ok';
    if (b.fulfillment_status === 'dispatched') return 'ok';
    if (b.fulfillment_status === 'partial') return 'info';
    return b.state === 'created' ? 'info' : 'warn';
  }

  load(quiet = false): void {
    const id = this.id() || location.pathname.split('/').filter(Boolean).pop() || '';
    if (!quiet) this.loading.set(true);
    this.error.set(null);
    this.shop.order(id).subscribe({
      next: (o) => {
        this.order.set(o);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        if (!quiet) this.error.set(err.message);
      },
    });
  }

  onPaid(): void {
    this.payOpen.set(false);
    this.load(true);
  }
}
