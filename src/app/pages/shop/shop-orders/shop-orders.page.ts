import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { ShopService, money } from '../../../core/services/shop.service';
import { ShopOrderRow } from '../../../core/models/shop.models';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';
import { InfiniteScrollDirective } from '../../../shared/infinite-scroll.directive';
import { shopTone } from '../shop-order/shop-order.page';

@Component({
  selector: 'app-shop-orders',
  imports: [RouterLink, DatePipe, IonIcon, IonSpinner, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, InfiniteScrollDirective],
  styleUrl: '../shop.shared.scss',
  styles: `
    .o { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 18px; background: var(--c-surface); border: 1px solid var(--c-line); color: inherit; text-decoration: none; }
    .o .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .o .ref { font-weight: 700; font-size: var(--fs-md, 16px); }
    .o .meta { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
    .list { display: flex; flex-direction: column; gap: 10px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="title-row">
        <div>
          <span class="eyebrow">Bought from our brands</span>
          <h1 class="page-title">Shop orders</h1>
        </div>
        <a class="btn btn-outline btn-sm" routerLink="/app/shop">Shop</a>
      </header>
      <p class="notice"><ion-icon name="information-circle-outline" aria-hidden="true"></ion-icon><span>These are products you bought in the Shop. Your stitching orders are on the Orders tab.</span></p>

      @if (loading() && items().length === 0) {
        <app-skeleton variant="tiles" [count]="4" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (items().length === 0) {
        <app-empty-state icon="storefront-outline" title="No Shop orders yet" message="When you buy something in the Shop it will be tracked here, brand by brand.">
          <a class="btn btn-primary btn-sm" routerLink="/app/shop">Browse the Shop</a>
        </app-empty-state>
      } @else {
        <div class="list">
          @for (o of items(); track o.id) {
            <a class="o" [routerLink]="['/app/shop/orders', o.id]">
              <div class="top">
                <span class="ref">{{ o.reference }}</span>
                <span class="pill" [attr.data-tone]="tone(o.status)">{{ o.status_label }}</span>
              </div>
              <span class="muted small">{{ o.brands.join(', ') }} · {{ o.items_count }} item{{ o.items_count === 1 ? '' : 's' }}</span>
              <div class="meta">
                <span class="muted small">{{ o.created_at | date: 'd MMM y' }}</span>
                <strong class="tabular">{{ fmt(o) }}</strong>
              </div>
            </a>
          }
        </div>
        @if (hasMore()) {
          <div class="more-row" appInfiniteScroll (reached)="loadMore()">
            @if (loadingMore()) {
              <ion-spinner name="crescent"></ion-spinner>
            } @else {
              <button type="button" class="btn btn-outline btn-sm" (click)="loadMore()">Show more</button>
            }
          </div>
        }
      }
    </div>
  `,
})
export class ShopOrdersPage {
  private shop = inject(ShopService);
  tone = shopTone;

  items = signal<ShopOrderRow[]>([]);
  page = signal(1);
  hasMore = signal(false);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  fmt(o: ShopOrderRow): string {
    return money(o.total, o.currency);
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.fetch(1);
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.fetch(this.page() + 1);
  }

  private fetch(page: number): void {
    this.shop.orders(page).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.page.set(page);
        this.items.update((l) => (page === 1 ? res.items : [...l, ...res.items.filter((o) => !l.some((x) => x.id === o.id))]));
        this.hasMore.set(res.meta.hasMore);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (page === 1) this.error.set(err.message);
        else this.hasMore.set(false);
      },
    });
  }
}
