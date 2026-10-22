import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResult, Paged } from '../models/api.models';
import {
  ShopAddress,
  ShopCart,
  ShopCheckoutResult,
  ShopFilters,
  ShopListQuery,
  ShopOrderDetail,
  ShopOrderRow,
  ShopPaymentStart,
  ShopProduct,
  ShopProductCard,
} from '../models/shop.models';

/** Customer Shop endpoints (/client/shop/*). Also keeps the cart item count for the badge in the navigation. */
@Injectable({ providedIn: 'root' })
export class ShopService {
  private api = inject(ApiService);

  /** The last cart the server sent (null until loaded). */
  readonly cart = signal<ShopCart | null>(null);
  readonly cartCount = computed(() => (this.cart()?.items ?? []).reduce((n, i) => n + i.quantity, 0));

  filters(): Observable<ShopFilters> {
    return this.api.get<ShopFilters>('/client/shop/filters');
  }

  products(q: ShopListQuery): Observable<Paged<ShopProductCard>> {
    return this.api.getPage<ShopProductCard>('/client/shop/products', {
      page: q.page,
      limit: q.limit ?? 12,
      search: q.search,
      brand: q.brand,
      category: q.category,
      collection: q.collection,
      sort: q.sort,
      min: q.min,
      max: q.max,
      in_stock: q.in_stock ? 1 : undefined,
    });
  }

  product(id: string): Observable<ShopProduct> {
    return this.api.get<ShopProduct>(`/client/shop/products/${encodeURIComponent(id)}`);
  }

  loadCart(): Observable<ShopCart> {
    return this.api.get<ShopCart>('/client/shop/cart').pipe(tap((c) => this.cart.set(c)));
  }

  setItem(variantId: string, quantity: number): Observable<ShopCart> {
    return this.api.put<ShopCart>('/client/shop/cart/items', { variant_id: variantId, quantity }).pipe(
      map((r) => r.data),
      tap((c) => this.cart.set(c)),
    );
  }

  removeItem(variantId: string): Observable<ShopCart> {
    return this.api.delete<ShopCart>(`/client/shop/cart/items/${encodeURIComponent(variantId)}`).pipe(
      map((r) => r.data),
      tap((c) => this.cart.set(c)),
    );
  }

  checkout(address: ShopAddress, email?: string): Observable<ApiResult<ShopCheckoutResult>> {
    return this.api.post<ShopCheckoutResult>('/client/shop/checkout', { address, email: email || undefined });
  }

  orders(page: number, limit = 10): Observable<Paged<ShopOrderRow>> {
    return this.api.getPage<ShopOrderRow>('/client/shop/orders', { page, limit });
  }

  order(id: string): Observable<ShopOrderDetail> {
    return this.api.get<ShopOrderDetail>(`/client/shop/orders/${encodeURIComponent(id)}`);
  }

  /** A payment for an order that is not paid yet (the same one is reused when it is still open). */
  startPayment(orderId: string): Observable<ShopPaymentStart> {
    return this.api.post<{ order: unknown; payment: ShopPaymentStart }>(`/client/shop/orders/${encodeURIComponent(orderId)}/retry-payment`).pipe(map((r) => r.data.payment));
  }

  /** The server asks Stripe whether the money arrived. */
  confirmPayment(orderId: string, paymentIntentId: string): Observable<ApiResult<ShopOrderDetail>> {
    return this.api.post<ShopOrderDetail>(`/client/shop/orders/${encodeURIComponent(orderId)}/confirm-payment`, { payment_intent_id: paymentIntentId });
  }
}

export function money(amount: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(amount ?? 0);
  const code = (currency || '').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code || 'USD' }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`.trim();
  }
}
