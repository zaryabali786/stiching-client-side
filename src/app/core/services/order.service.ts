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
  ApprovalsOverview,
  ReturnShipping,
  CodInfo,
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

  /** Order totals per tab (all, draft, and each stage). */
  counts(): Observable<Record<string, number>> {
    return this.api.get('/client/orders/counts');
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

  /** Throws away a draft made from an email (the email's order stays available in the Inbox). */
  /** Confirm how an email draft was paid when the email did not say (never cash on delivery). */
  confirmPaymentMethod(id: string, method: string): Observable<ApiResult<{ brand_payment_method: string }>> {
    return this.api.post<{ brand_payment_method: string }>(`/client/orders/${encodeURIComponent(id)}/payment-method`, { method });
  }

  /** An order from a brand's store whose shipment is on hold: "yes, send it to your atelier". */
  confirmShopifyAddress(id: string): Observable<ApiResult<{ changed: boolean }>> {
    return this.api.post<{ changed: boolean }>(`/client/orders/${encodeURIComponent(id)}/shopify/confirm-address`);
  }

  /** Choose COD or Non-COD on an email order. COD reads the total from the original email. */
  setPaymentType(id: string, type: 'COD' | 'NON_COD'): Observable<ApiResult<{ cod: CodInfo }>> {
    return this.api.post<{ cod: CodInfo }>(`/client/orders/${encodeURIComponent(id)}/payment-type`, { type });
  }

  /** Pay Now: a Stripe Checkout page for the verified total (the amount is decided by the server). */
  startCodCheckout(id: string): Observable<ApiResult<{ url: string; sessionId: string; amount: number; currency: string }>> {
    return this.api.post<{ url: string; sessionId: string; amount: number; currency: string }>(`/client/orders/${encodeURIComponent(id)}/cod/checkout`);
  }

  /** Pay Now inside the app: the PaymentIntent the Payment Element pays (the amount is decided by the server). */
  startCodPayment(id: string): Observable<ApiResult<PaymentStart>> {
    return this.api.post<PaymentStart>(`/client/orders/${encodeURIComponent(id)}/cod/payment-intent`);
  }

  /** Ask the server whether Stripe has confirmed the payment (the server asks Stripe; nothing is trusted from the app). It never charges. */
  confirmCodPayment(id: string): Observable<ApiResult<{ paid: boolean; status: string; stripe_status?: string; cod: CodInfo }>> {
    return this.api.post<{ paid: boolean; status: string; stripe_status?: string; cod: CodInfo }>(`/client/orders/${encodeURIComponent(id)}/cod/confirm`);
  }

  discardDraft(id: string): Observable<ApiResult<null>> {
    return this.api.delete(`/client/orders/${encodeURIComponent(id)}`);
  }

  cancel(id: string): Observable<ApiResult<null>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/cancel`);
  }

  /** Orders with photos sent for approval, every article with its state (waiting / approved / rejected). */
  approvalsOverview(): Observable<ApprovalsOverview> {
    return this.api.get<ApprovalsOverview>('/client/approvals');
  }

  /** One article (`unitId`) or every waiting article when omitted. */
  approve(id: string, unitId?: string): Observable<ApiResult<{ approved: number; stillWaiting: number } | null>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/approve`, unitId ? { unit_id: unitId } : {});
  }

  /** A written note, a voice note, or both. */
  /** Approve or reject ONE received article. A rejection needs a reason; photos are optional. */
  reviewArticle(id: string, unitId: string, body: { decision: 'approve' | 'reject'; action?: 'return' | 'hold'; note?: string; shipping?: ReturnShipping; return_to?: 'brand' | 'customer'; media?: { name: string; dataUrl: string }[] }): Observable<ApiResult<unknown>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/units/${encodeURIComponent(unitId)}/review`, body);
  }

  /** Reject every article that is waiting: one reason, one place to send the parcel back to. */
  rejectParcel(id: string, body: { note: string; action?: 'return' | 'hold'; shipping?: ReturnShipping; return_to?: 'brand' | 'customer'; media?: { name: string; dataUrl: string }[] }): Observable<ApiResult<unknown>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/reject-parcel`, body);
  }

  /** Ask us to send a rejected article back (for correction or replacement). */
  returnArticle(id: string, unitId: string, note?: string): Observable<ApiResult<unknown>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/units/${encodeURIComponent(unitId)}/return`, { note: note || undefined });
  }

  /** The customer reviewed the photos / videos of the parcel we received and accepts them. */
  approveParcel(id: string): Observable<ApiResult<unknown>> {
    return this.api.post(`/client/orders/${encodeURIComponent(id)}/approve-parcel`, {});
  }

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
