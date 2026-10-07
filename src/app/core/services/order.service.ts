import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  ApiResult,
  ClientOverview,
  OrderDetail,
  OrderInput,
  OrderListRow,
  Paged,
  VoiceRef,
  PaymentConfirmation,
  PaymentStart,
} from '../models/api.models';

export interface OrderListQuery {
  page: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'completed' | string;
}

/** Customer order endpoints (/client/overview, /client/orders/*). */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private api = inject(ApiService);

  overview(period: 'year' | 'all'): Observable<ClientOverview> {
    return this.api.get<ClientOverview>('/client/overview', { period });
  }

  list(query: OrderListQuery): Observable<Paged<OrderListRow>> {
    return this.api.getPage<OrderListRow>('/client/orders', {
      page: query.page,
      limit: query.limit ?? 10,
      search: query.search,
      status: query.status === 'all' ? undefined : query.status,
    });
  }

  get(id: string): Observable<OrderDetail> {
    return this.api.get<OrderDetail>(`/client/orders/${encodeURIComponent(id)}`);
  }

  create(body: OrderInput): Observable<ApiResult<OrderDetail>> {
    return this.api.post<OrderDetail>('/client/orders', body);
  }

  update(id: string, body: OrderInput): Observable<ApiResult<OrderDetail>> {
    return this.api.patch<OrderDetail>(`/client/orders/${encodeURIComponent(id)}`, body);
  }

  cancel(id: string): Observable<ApiResult<null>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/cancel`);
  }

  /** One article (`unitId`) or every waiting article when omitted. */
  approve(id: string, unitId?: string): Observable<ApiResult<{ approved: number; stillWaiting: number } | null>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/approve`, unitId ? { unit_id: unitId } : {});
  }

  /** A written note, a voice note, or both. */
  requestChanges(id: string, body: { unit_id?: string; note?: string; audio?: VoiceRef }): Observable<ApiResult<null>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/request-changes`, body);
  }

  /** Starts (or resumes) the Stripe card payment for the issued invoice. */
  startPayment(id: string): Observable<ApiResult<PaymentStart>> {
    return this.api.post<PaymentStart>(`/client/orders/${encodeURIComponent(id)}/payment-intent`);
  }

  /** After Stripe confirms the card: the server verifies with Stripe and marks the invoice paid. */
  confirmPayment(id: string, paymentIntentId: string): Observable<ApiResult<PaymentConfirmation>> {
    return this.api.post<PaymentConfirmation>(`/client/orders/${encodeURIComponent(id)}/payment-intent/confirm`, { payment_intent_id: paymentIntentId });
  }
}
