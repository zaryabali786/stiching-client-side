import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonSpinner } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { OrderService } from '../../core/services/order.service';
import { ToastService } from '../../core/services/toast.service';

/**
 * Where Stripe Checkout sends the customer back (success or cancel). Coming back proves nothing by itself: when the customer
 * is signed in here, the server is asked to check the payment with Stripe and the order is opened. In the phone's browser
 * (where the app's sign-in does not exist) the page only says what to do next; the app checks the payment when it is opened.
 */
@Component({
  selector: 'app-pay-return',
  imports: [RouterLink, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      @if (busy()) {
        <ion-spinner name="crescent"></ion-spinner>
        <p>Checking your payment…</p>
      } @else {
        <h1>{{ cancelled() ? 'Payment cancelled' : review() ? 'Payment under review' : 'Thank you' }}</h1>
        @if (cancelled()) {
          <p>No money was taken. You can try again from your order with Pay Now.</p>
        } @else if (review()) {
          <p>We could not confirm this payment automatically (for example, the amount did not match). Your order was not marked paid; our team will check it and contact you.</p>
        } @else {
          <p>We are confirming your payment with {{ provider() }}. Return to the Stitch&amp;Ship app: your order updates by itself once the payment is confirmed.</p>
        }
        <a class="btn btn-primary" [routerLink]="orderLink()" [queryParams]="orderParams()">Open my order</a>
      }
    </main>
  `,
  styles: `
    .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px 16px; text-align: center; }
    h1 { margin: 0; font-size: 24px; }
    p { margin: 0; max-width: 40ch; color: var(--c-muted, #666); }
  `,
})
export class PayReturnPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private orders = inject(OrderService);
  private toast = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly cancelled = signal(false);
  protected readonly review = signal(false);
  protected readonly provider = signal('Stripe');
  private orderId = '';

  protected orderLink(): string[] {
    return this.orderId ? ['/app/orders', this.orderId] : ['/app/orders'];
  }

  protected orderParams(): Record<string, string> {
    return {};
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.orderId = /^[0-9a-f-]{36}$/i.test(q.get('order') || '') ? (q.get('order') as string) : '';
    this.cancelled.set(q.get('result') === 'cancel');
    this.review.set(q.get('result') === 'review');
    if (q.get('provider') === 'payfast') this.provider.set('PayFast');
    // signed in here (the website): open the order, after the server has checked the payment with Stripe
    if (this.orderId && this.auth.isAuthenticated()) {
      if (this.review()) {
        this.toast.info('This payment needs a check by our team. Your order was not marked paid.');
        void this.router.navigate(['/app/orders', this.orderId], { replaceUrl: true });
        return;
      }
      if (this.cancelled()) {
        this.toast.info('Payment cancelled. You can try again with Pay Now.');
        void this.router.navigate(['/app/orders', this.orderId], { replaceUrl: true });
        return;
      }
      this.busy.set(true);
      this.orders.confirmCodPayment(this.orderId).subscribe({
        next: ({ data }) => {
          if (data.paid) this.toast.success('Payment received. You can edit your order now.');
          else this.toast.info('The payment has not been confirmed yet. This page updates when it is.');
          void this.router.navigate(['/app/orders', this.orderId], { replaceUrl: true });
        },
        error: () => {
          void this.router.navigate(['/app/orders', this.orderId], { replaceUrl: true });
        },
      });
    }
  }
}
