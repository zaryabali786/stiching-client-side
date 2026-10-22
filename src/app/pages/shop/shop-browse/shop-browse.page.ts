import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Subject, debounceTime, map } from 'rxjs';
import { ShopService, money } from '../../../core/services/shop.service';
import { ShopFilters, ShopProductCard, ShopSort } from '../../../core/models/shop.models';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';
import { InfiniteScrollDirective } from '../../../shared/infinite-scroll.directive';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-shop-browse',
  imports: [RouterLink, IonIcon, IonSpinner, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, InfiniteScrollDirective],
  styleUrl: '../shop.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="title-row">
        <div>
          <span class="eyebrow">Products from our brands</span>
          <h1 class="page-title">Shop</h1>
        </div>
        <div class="row-actions">
          <a class="btn btn-outline btn-sm" routerLink="/app/shop/orders"><ion-icon name="cube-outline" aria-hidden="true"></ion-icon> Shop orders</a>
          <a class="btn btn-primary btn-sm cart-btn" routerLink="/app/shop/cart" aria-label="Cart">
            <ion-icon name="cart-outline" aria-hidden="true"></ion-icon> Cart
            @if (shop.cartCount() > 0) {
              <span class="n">{{ shop.cartCount() }}</span>
            }
          </a>
        </div>
      </header>

      <div class="input-affix leading">
        <ion-icon class="affix-icon" name="search-outline" aria-hidden="true"></ion-icon>
        <input class="input" type="search" placeholder="Search products" [value]="searchText()" (input)="onSearch($any($event.target).value)" aria-label="Search products" />
        @if (searchText()) {
          <button type="button" class="affix-btn" (click)="onSearch('')" aria-label="Clear search"><ion-icon name="close-circle" aria-hidden="true"></ion-icon></button>
        }
      </div>

      @if (filters(); as f) {
        @if (f.brands.length > 1) {
          <div class="chips" role="group" aria-label="Brands">
            <button type="button" class="chip" [class.active]="!brand()" (click)="setBrand('')">All brands</button>
            @for (b of f.brands; track b.id) {
              <button type="button" class="chip" [class.active]="brand() === b.id" (click)="setBrand(b.id)">{{ b.name }} · {{ b.count }}</button>
            }
          </div>
        }
        <div class="filters">
          @if (f.categories.length) {
            <select class="input" [value]="category()" (change)="setCategory($any($event.target).value)" aria-label="Category">
              <option value="">All categories</option>
              @for (c of f.categories; track c.name) {
                <option [value]="c.name">{{ c.name }} ({{ c.count }})</option>
              }
            </select>
          }
          @if (f.collections.length) {
            <select class="input" [value]="collection()" (change)="setCollection($any($event.target).value)" aria-label="Collection">
              <option value="">All collections</option>
              @for (c of f.collections; track c.name) {
                <option [value]="c.name">{{ c.name }} ({{ c.count }})</option>
              }
            </select>
          }
          <select class="input" [value]="sort()" (change)="setSort($any($event.target).value)" aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="title">Name A to Z</option>
          </select>
          <label class="chip" [class.active]="inStock()" style="display: flex; align-items: center; justify-content: center">
            <input type="checkbox" [checked]="inStock()" (change)="setInStock($any($event.target).checked)" hidden />
            In stock only
          </label>
        </div>
      }

      @if (loading() && items().length === 0) {
        <app-skeleton variant="tiles" [count]="6" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (items().length === 0) {
        <app-empty-state icon="storefront-outline" title="No products found" [message]="isFiltered() ? 'Nothing matches those filters. Try a different search.' : 'No brand products are in the Shop yet. Please check back soon.'">
          @if (isFiltered()) {
            <button type="button" class="btn btn-outline btn-sm" (click)="clear()">Clear filters</button>
          }
        </app-empty-state>
      } @else {
        <div class="grid" [style.opacity]="loading() ? 0.55 : 1">
          @for (p of items(); track p.id) {
            <a class="card" [routerLink]="['/app/shop/product', p.id]">
              <div class="ph">
                @if (p.image_url && !failed().has(p.id)) {
                  <img [src]="p.image_url" [alt]="p.title" loading="lazy" decoding="async" (error)="imageFailed(p.id)" />
                } @else {
                  <ion-icon name="image-outline" aria-hidden="true"></ion-icon>
                }
                @if (!p.in_stock) {
                  <span class="stock out">Sold out</span>
                } @else if (p.discount_percent) {
                  <span class="stock sale">-{{ p.discount_percent }}%</span>
                }
              </div>
              <div class="body">
                <span class="brand">{{ p.brand.name }}</span>
                <h3 class="title">{{ p.title }}</h3>
                <span class="price-line">
                  <span class="price tabular">{{ priceLabel(p) }}</span>
                  @if (p.compare_at_price) {
                    <span class="was tabular">{{ money(p.compare_at_price, p.currency) }}</span>
                  }
                </span>
                @if (swatches(p); as sw) {
                  <span class="swatches" [attr.aria-label]="(p.colors?.length ?? 0) + ' colours'">
                    @for (c of sw.dots; track c) {
                      <i class="dot" [style.background]="c" aria-hidden="true"></i>
                    }
                    @if (sw.more > 0) {
                      <span class="more-n">+{{ sw.more }}</span>
                    }
                  </span>
                }
              </div>
            </a>
          }
        </div>
        @if (hasMore()) {
          @if (moreError()) {
            <div class="more-row"><button type="button" class="btn btn-outline btn-sm" (click)="loadMore()">{{ moreError() }} Try again</button></div>
          } @else if (loadingMore()) {
            <div class="more-row"><ion-spinner name="crescent"></ion-spinner></div>
          } @else {
            <div class="more-row" appInfiniteScroll (reached)="loadMore()"><button type="button" class="btn btn-outline btn-sm" (click)="loadMore()">Show more</button></div>
          }
        }
      }
    </div>
  `,
})
export class ShopBrowsePage {
  protected shop = inject(ShopService);
  private destroyRef = inject(DestroyRef);

  searchText = signal('');
  private search = signal('');
  brand = signal('');
  category = signal('');
  collection = signal('');
  sort = signal<ShopSort>('newest');
  inStock = signal(false);

  filters = signal<ShopFilters | null>(null);
  items = signal<ShopProductCard[]>([]);
  page = signal(1);
  hasMore = signal(false);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal<string | null>(null);
  moreError = signal<string | null>(null);

  /** Products whose picture could not be loaded: they show the placeholder instead of a broken image. */
  failed = signal<Set<string>>(new Set());
  protected money = money;

  imageFailed(id: string): void {
    this.failed.update((s) => new Set(s).add(id));
  }

  /** Colour dots for the colour names the browser understands ("Black", "Navy"); the others are counted as "+N". */
  swatches(p: ShopProductCard): { dots: string[]; more: number } | null {
    const colors = p.colors ?? [];
    if (!colors.length) return null;
    const css = (name: string): string | null => {
      for (const c of [name, name.replace(/\s+/g, '')]) if (typeof CSS !== 'undefined' && CSS.supports('color', c)) return c;
      return null;
    };
    const dots = colors.map(css).filter((c): c is string => !!c).slice(0, 5);
    return { dots, more: colors.length - dots.length };
  }

  isFiltered = computed(() => !!(this.search() || this.brand() || this.category() || this.collection() || this.inStock()));

  private run = 0;
  private searchInput$ = new Subject<string>();

  constructor() {
    this.shop.filters().subscribe({ next: (f) => this.filters.set(f), error: () => undefined });
    this.shop.loadCart().subscribe({ error: () => undefined });
    this.searchInput$
      .pipe(map((s) => s.trim()), debounceTime(350), takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => {
        if (s === this.search()) return;
        this.search.set(s);
        this.reload();
      });
    this.reload();
  }

  priceLabel(p: ShopProductCard): string {
    return p.price_max > p.price_min ? `${money(p.price_min, p.currency)} – ${money(p.price_max, p.currency)}` : money(p.price_min, p.currency);
  }

  onSearch(value: string): void {
    this.searchText.set(value);
    this.searchInput$.next(value);
  }

  setBrand(v: string): void {
    this.brand.set(v);
    this.reload();
  }
  setCategory(v: string): void {
    this.category.set(v);
    this.reload();
  }
  setCollection(v: string): void {
    this.collection.set(v);
    this.reload();
  }
  setSort(v: ShopSort): void {
    this.sort.set(v);
    this.reload();
  }
  setInStock(v: boolean): void {
    this.inStock.set(v);
    this.reload();
  }

  clear(): void {
    this.searchText.set('');
    this.search.set('');
    this.brand.set('');
    this.category.set('');
    this.collection.set('');
    this.inStock.set(false);
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.moreError.set(null);
    this.fetch(1);
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.moreError.set(null);
    this.fetch(this.page() + 1);
  }

  private fetch(page: number): void {
    const run = ++this.run;
    this.shop
      .products({
        page,
        limit: PAGE_SIZE,
        search: this.search(),
        brand: this.brand(),
        category: this.category(),
        collection: this.collection(),
        sort: this.sort(),
        in_stock: this.inStock(),
      })
      .subscribe({
        next: (res) => {
          if (run !== this.run) return;
          this.loading.set(false);
          this.loadingMore.set(false);
          this.page.set(page);
          this.items.update((list) => (page === 1 ? res.items : [...list, ...res.items.filter((p) => !list.some((x) => x.id === p.id))]));
          this.hasMore.set(res.meta.hasMore);
        },
        error: (err: Error) => {
          if (run !== this.run) return;
          this.loading.set(false);
          this.loadingMore.set(false);
          if (page === 1) this.error.set(err.message);
          else this.moreError.set(err.message);
        },
      });
  }
}
