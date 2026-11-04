import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';

export interface OrderReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

/** What the review page shows: the order, whether it can be reviewed, and the review already given (if any). */
export interface ReviewState {
  order: { id: string; reference: string; brand: string | null; delivered_at: string | null };
  customer_name: string | null;
  reviewable: boolean;
  review: OrderReview | null;
}

export interface ReviewSaved {
  order: ReviewState['order'];
  review: OrderReview;
}

/**
 * Customer reviews. Two ways in, one result: the link in the review email (a signed token names the order, no sign-in needed) and a
 * signed-in customer's own order. The server decides who may review what; nothing here trusts the page.
 */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private api = inject(ApiService);

  /** The state behind an email link. */
  byToken(token: string): Observable<ReviewState> {
    return this.api.get<ReviewState>(`/reviews/invite/${encodeURIComponent(token)}`);
  }

  submitByToken(token: string, rating: number, comment: string): Observable<ReviewSaved> {
    return this.api.post<ReviewSaved>(`/reviews/invite/${encodeURIComponent(token)}`, { rating, comment }).pipe(map((r) => r.data));
  }

  /** The state of one of the signed-in customer's own orders. */
  forOrder(orderId: string): Observable<ReviewState> {
    return this.api.get<ReviewState>(`/client/orders/${encodeURIComponent(orderId)}/review`);
  }

  submitForOrder(orderId: string, rating: number, comment: string): Observable<ReviewSaved> {
    return this.api.post<ReviewSaved>(`/client/orders/${encodeURIComponent(orderId)}/review`, { rating, comment }).pipe(map((r) => r.data));
  }
}
