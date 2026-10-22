import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { ShopService, money } from '../../../core/services/shop.service';
import { ToastService } from '../../../core/services/toast.service';
import { ShopProduct, ShopVariant } from '../../../core/models/shop.models';
import { ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';

@Component({
  selector: 'app-shop-product',
  imports: [RouterLink, IonIcon, IonSpinner, SkeletonComponent, ErrorStateComponent],
  styleUrl: '../shop.shared.scss',
  styles: `
    .gallery { display: flex; flex-direction: column; gap: 8px; }
    .main-img { aspect-ratio: 1 / 1; border-radius: 20px; overflow: hidden; background: var(--c-bg); display: flex; align-items: center; justify-content: center; color: var(--c-faint); font-size: 48px; }
    .main-img img { width: 100%; height: 100%; object-fit: cover; }
    .thumbs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
    .thumbs button { flex: none; width: 56px; height: 56px; border-radius: 12px; overflow: hidden; border: 2px solid transparent; padding: 0; background: var(--c-bg); }
    .thumbs button.on { border-color: var(--c-accent, #0f392b); }
    .thumbs img { width: 100%; height: 100%; object-fit: cover; }
    h1 { margin: 0; font-size: 22px; line-height: 1.25; }
    .price-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .price { font-size: 24px; font-weight: 700; }
    .was { text-decoration: line-through; color: var(--c-muted); }
    .off { padding: 2px 8px; border-radius: 999px; background: #fde8e8; color: #b42318; font-size: var(--fs-xs); font-weight: 700; }
    .sku { font-size: var(--fs-xs); color: var(--c-muted); }
    .opt { display: flex; flex-direction: column; gap: 6px; }
    .opt .k { font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--c-muted); }
    .vals { display: flex; gap: 8px; flex-wrap: wrap; }
    .val { padding: 9px 14px; border-radius: 12px; border: 1px solid var(--c-line); background: var(--c-surface); font-weight: 600; font-size: var(--fs-sm); color: var(--c-ink); }
    .val.on { border-color: var(--c-accent, #0f392b); box-shadow: inset 0 0 0 1px var(--c-accent, #0f392b); }
    .val:disabled { opacity: 0.4; text-decoration: line-through; }
    .qty { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--c-line); border-radius: 999px; padding: 2px; }
    .qty button { width: 36px; height: 36px; border-radius: 50%; border: 0; background: transparent; font-size: 18px; color: var(--c-ink); }
    .qty button:disabled { opacity: 0.35; }
    .qty span { min-width: 28px; text-align: center; font-weight: 700; }
    .buy { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .buy .btn { flex: 1; min-width: 160px; }
    .desc { white-space: pre-line; line-height: 1.55; font-size: var(--fs-sm); color: var(--c-ink); margin: 0; }
    .back { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: var(--fs-sm); color: var(--c-muted); text-decoration: none; }
    @media (min-width: 720px) { .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; } }
    .layout { display: flex; flex-direction: column; gap: 16px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a class="back" routerLink="/app/shop"><ion-icon name="chevron-back-outline" aria-hidden="true"></ion-icon> Shop</a>

      @if (loading()) {
        <app-skeleton variant="cards" [count]="2" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (product(); as p) {
        <div class="layout">
          <div class="gallery">
            <div class="main-img">
              @if (shownImage() && failedUrl() !== shownImage()) {
                <img [src]="shownImage()" [alt]="p.title" decoding="async" (error)="failedUrl.set(shownImage())" />
              } @else {
                <ion-icon name="image-outline" aria-hidden="true"></ion-icon>
              }
            </div>
            @if (p.images.length > 1) {
              <div class="thumbs">
                @for (img of p.images; track img) {
                  <button type="button" [class.on]="img === shownImage()" (click)="pickedImage.set(img)" aria-label="Show picture"><img [src]="img" alt="" loading="lazy" /></button>
                }
              </div>
            }
          </div>

          <div class="panel" style="border: 0; padding: 0; background: transparent">
            <span class="eyebrow">{{ p.brand.name }}</span>
            <h1>{{ p.title }}</h1>
            <div class="price-row">
              <span class="price tabular">{{ priceText() }}</span>
              @if (variant()?.compare_at_price && variant()!.compare_at_price! > variant()!.price) {
                <span class="was tabular">{{ fmt(variant()!.compare_at_price!) }}</span>
                <span class="off">-{{ discountPercent() }}%</span>
              }
              <span class="stock" [class.out]="!available()" [class.low]="available() && lowStock()">{{ stockText() }}</span>
            </div>

            @if (variant()?.sku) {
              <span class="sku">SKU: {{ variant()!.sku }}</span>
            }

            @for (o of p.options; track o.name) {
              @if (o.values.length > 1 || p.variants.length > 1) {
                <div class="opt">
                  <span class="k">{{ o.name }}: <b style="color: var(--c-ink)">{{ selected()[o.name] }}</b></span>
                  <div class="vals" role="group" [attr.aria-label]="o.name">
                    @for (v of o.values; track v) {
                      <button type="button" class="val" [class.on]="selected()[o.name] === v" [disabled]="!valueAvailable(o.name, v)" [attr.aria-pressed]="selected()[o.name] === v" (click)="choose(o.name, v)">{{ v }}</button>
                    }
                  </div>
                </div>
              }
            }

            <div class="buy">
              <div class="qty" role="group" aria-label="Quantity">
                <button type="button" (click)="qty.set(qty() - 1)" [disabled]="qty() <= 1" aria-label="Fewer"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon></button>
                <span class="tabular" aria-live="polite">{{ qty() }}</span>
                <button type="button" (click)="qty.set(qty() + 1)" [disabled]="qty() >= maxQty()" aria-label="More"><ion-icon name="add-outline" aria-hidden="true"></ion-icon></button>
              </div>
              <button type="button" class="btn btn-primary" (click)="add()" [disabled]="!available() || adding()">
                @if (adding()) {
                  <ion-spinner name="crescent"></ion-spinner>
                } @else {
                  <ion-icon name="cart-outline" aria-hidden="true"></ion-icon>
                }
                {{ !variant() ? 'Select options' : available() ? 'Add to cart' : 'Out of stock' }}
              </button>
            </div>
            @if (added()) {
              <p class="notice"><ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon><span>Added to your cart. <a routerLink="/app/shop/cart"><b>View cart</b></a></span></p>
            }
            @if (addError()) {
              <p class="notice bad" role="alert"><ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon><span>{{ addError() }}</span></p>
            }

            <p class="notice"><ion-icon name="storefront-outline" aria-hidden="true"></ion-icon><span>Fulfilled and shipped by <b>{{ p.fulfilled_by || p.brand.name }}</b>. We take your order and payment; the brand sends it to you.</span></p>

            @if (description()) {
              <p class="desc">{{ description() }}</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ShopProductPage {
  private shop = inject(ShopService);
  private toast = inject(ToastService);

  /** Route parameter (withComponentInputBinding), falls back to the id read from the URL. */
  readonly id = input<string>('');

  product = signal<ShopProduct | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  selected = signal<Record<string, string>>({});
  pickedImage = signal<string | null>(null);
  /** The picture that failed to load (the placeholder is shown instead of a broken image). */
  failedUrl = signal<string | null>(null);
  qty = signal(1);
  adding = signal(false);
  added = signal(false);
  addError = signal<string | null>(null);

  variant = computed<ShopVariant | null>(() => {
    const p = this.product();
    if (!p) return null;
    const sel = this.selected();
    return p.variants.find((v) => p.options.every((o) => v.options[o.name] === sel[o.name])) ?? (p.options.length === 0 ? (p.variants[0] ?? null) : null);
  });
  discountPercent = computed(() => {
    const v = this.variant();
    return v?.compare_at_price && v.compare_at_price > v.price ? Math.round(((v.compare_at_price - v.price) / v.compare_at_price) * 100) : 0;
  });
  available = computed(() => !!this.variant()?.in_stock);
  lowStock = computed(() => {
    const q = this.variant()?.quantity_hint;
    return q !== null && q !== undefined && q > 0 && q <= 5;
  });
  maxQty = computed(() => {
    const q = this.variant()?.quantity_hint;
    return q !== null && q !== undefined && q > 0 ? Math.min(q, 20) : 20;
  });
  shownImage = computed(() => this.pickedImage() || this.variant()?.image_url || this.product()?.image_url || this.product()?.images[0] || null);
  description = computed(() => (this.product()?.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim());

  constructor() {
    queueMicrotask(() => this.load());
  }

  fmt(n: number): string {
    return money(n, this.product()?.currency);
  }

  priceText(): string {
    const p = this.product();
    const v = this.variant();
    if (v) return this.fmt(v.price);
    if (!p) return '';
    const prices = p.variants.map((x) => x.price);
    return prices.length ? `${this.fmt(Math.min(...prices))}${Math.max(...prices) > Math.min(...prices) ? ' – ' + this.fmt(Math.max(...prices)) : ''}` : '';
  }

  stockText(): string {
    if (!this.variant()) return 'Choose options';
    if (!this.available()) return 'Out of stock';
    return this.lowStock() ? `Only ${this.variant()!.quantity_hint} left` : 'In stock';
  }

  /** A value is offered when some in-stock variant has it together with the other options already chosen. */
  valueAvailable(option: string, value: string): boolean {
    const p = this.product();
    if (!p) return false;
    const sel = { ...this.selected(), [option]: value };
    return p.variants.some((v) => v.in_stock && p.options.every((o) => o.name === option || !sel[o.name] || v.options[o.name] === sel[o.name]) && v.options[option] === value);
  }

  choose(option: string, value: string): void {
    const p = this.product();
    if (!p) return;
    const next = { ...this.selected(), [option]: value };
    // when the combination does not exist, keep the new value and move the other options to the first matching in-stock variant
    if (!p.variants.some((v) => p.options.every((o) => v.options[o.name] === next[o.name]))) {
      const match = p.variants.find((v) => v.in_stock && v.options[option] === value) ?? p.variants.find((v) => v.options[option] === value);
      if (match) for (const o of p.options) next[o.name] = match.options[o.name];
    }
    this.selected.set(next);
    this.pickedImage.set(null);
    this.qty.set(Math.min(this.qty(), this.maxQty()));
    this.added.set(false);
    this.addError.set(null);
  }

  load(): void {
    const id = this.id() || location.pathname.split('/').filter(Boolean).pop() || '';
    this.loading.set(true);
    this.error.set(null);
    this.shop.product(id).subscribe({
      next: (p) => {
        this.product.set(p);
        const first = p.variants.find((v) => v.in_stock) ?? p.variants[0];
        this.selected.set(first ? { ...first.options } : {});
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }

  add(): void {
    const v = this.variant();
    if (!v || !this.available() || this.adding()) return;
    this.adding.set(true);
    this.added.set(false);
    this.addError.set(null);
    const current = this.shop.cart()?.items.find((i) => i.variant_id === v.id)?.quantity ?? 0;
    this.shop.setItem(v.id, current + this.qty()).subscribe({
      next: () => {
        this.adding.set(false);
        this.added.set(true);
        this.toast.success('Added to your cart');
      },
      error: (err: Error) => {
        this.adding.set(false);
        this.addError.set(err.message);
      },
    });
  }
}
