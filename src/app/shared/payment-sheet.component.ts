import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked, viewChild, ElementRef } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { OrderService } from '../core/services/order.service';
import { StripeService } from '../core/services/stripe.service';
import { ToastService } from '../core/services/toast.service';
import { errorMessage } from '../core/services/api.service';
import { PaymentStart } from '../core/models/api.models';
import { SheetComponent } from './sheet.component';

type Phase = 'starting' | 'ready' | 'paying' | 'checking' | 'failed';

/**
 * Card payment for an issued invoice, in a bottom sheet. Uses Stripe's Payment Element (cards and wallets,
 * 3-D Secure handled by Stripe), so card numbers never touch our servers or this app's code.
 * The same component runs in the browser and in the native app.
 */
@Component({
  selector: 'app-payment-sheet',
  imports: [IonIcon, IonSpinner, SheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [open]="open()" title="Pay by card" [eyebrow]="invoiceNumber() ? 'Invoice ' + invoiceNumber() : 'Secure payment'" [locked]="phase() === 'paying' || phase() === 'checking'" (closed)="close()">
      <div class="pay">
        <div class="amount" aria-live="polite">
          <span class="k">Amount due</span>
          <strong class="v tabular">{{ amountLabel() }}</strong>
        </div>

        @if (phase() === 'starting') {
          <div class="loading" role="status">
            <ion-spinner name="crescent"></ion-spinner>
            <span>Preparing secure payment…</span>
          </div>
        }

        @if (phase() === 'failed' && !start()) {
          <div class="form-error" role="alert">
            <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
            <span>{{ error() }}</span>
          </div>
          <button type="button" class="btn btn-outline btn-block" (click)="begin()">Try again</button>
        }

        <!-- Stripe mounts its card form here -->
        <div #mount class="mount" [class.hidden]="!start()" [attr.aria-busy]="phase() === 'paying'"></div>

        @if (start()) {
          @if (error()) {
            <div class="form-error" role="alert">
              <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
              <span>{{ error() }}</span>
            </div>
          }
          @if (testMode()) {
            <p class="hint-test">
              <ion-icon name="information-circle-outline" aria-hidden="true"></ion-icon>
              Test mode. Use card <b>4242 4242 4242 4242</b>, any future date, any CVC. No real money moves.
            </p>
          }
          <p class="secure"><ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon> Payments are processed securely by Stripe. We never see your card number.</p>
        }
      </div>

      <div sheet-footer class="btn-row">
        <button type="button" class="btn btn-outline" (click)="close()" [disabled]="phase() === 'paying' || phase() === 'checking'">Cancel</button>
        <button type="button" class="btn btn-primary" (click)="pay()" [disabled]="phase() !== 'ready' || !complete()">
          @switch (phase()) {
            @case ('paying') { <ion-spinner name="crescent"></ion-spinner> Paying… }
            @case ('checking') { <ion-spinner name="crescent"></ion-spinner> Confirming… }
            @default { <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon> Pay {{ amountLabel() }} }
          }
        </button>
      </div>
    </app-sheet>
  `,
  styles: `
    .pay { display: flex; flex-direction: column; gap: 14px; padding-bottom: 6px; }
    .amount { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: 16px; background: var(--c-gold-tint); box-shadow: inset 0 0 0 1px var(--c-gold-line); }
    .amount .k { font-size: var(--fs-2xs); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-gold-dark); }
    .amount .v { font-size: 26px; font-weight: 600; color: var(--c-ink); }
    .loading { display: flex; align-items: center; gap: 10px; padding: 18px 4px; color: var(--c-muted); }
    .mount { min-height: 150px; }
    .mount.hidden { display: none; }
    .hint-test { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: var(--fs-sm); color: var(--t-blue-fg); background: var(--t-blue-bg); border-radius: 12px; padding: 10px 12px; line-height: 1.45; }
    .secure { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: var(--fs-xs); color: var(--c-faint); line-height: 1.4; }
    .secure ion-icon, .hint-test ion-icon { flex-shrink: 0; font-size: 16px; margin-top: 1px; }
  `,
})
export class PaymentSheetComponent {
  private orders = inject(OrderService);
  private stripeSvc = inject(StripeService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly orderId = input.required<string>();
  /** "GBP 70.99" — already formatted by the page. */
  readonly amountLabel = input('');
  readonly invoiceNumber = input('');

  readonly paid = output<void>();
  readonly closed = output<void>();

  private mountEl = viewChild<ElementRef<HTMLElement>>('mount');

  phase = signal<Phase>('starting');
  error = signal<string | null>(null);
  start = signal<PaymentStart | null>(null);
  complete = signal(false);
  testMode = signal(false);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private element: StripePaymentElement | null = null;
  private runId = 0;

  constructor() {
    // Each time the sheet opens: start a payment and mount Stripe's card form
    effect(() => {
      const isOpen = this.open();
      untracked(() => (isOpen ? this.begin() : this.teardown()));
    });
    this.destroyRef.onDestroy(() => this.teardown());
  }

  begin(): void {
    const run = ++this.runId;
    this.teardown(false);
    this.phase.set('starting');
    this.error.set(null);
    this.complete.set(false);
    this.start.set(null);

    this.orders.startPayment(this.orderId()).subscribe({
      next: async ({ data }) => {
        if (run !== this.runId) return;
        const stripe = await this.stripeSvc.load(data.publishableKey);
        if (run !== this.runId) return;
        if (!stripe) {
          this.fail('Could not reach the payment service. Check your connection and try again.');
          return;
        }
        this.stripe = stripe;
        this.testMode.set(data.publishableKey.startsWith('pk_test_'));
        this.start.set(data);
        // wait a tick so the mount node exists in the sheet
        setTimeout(() => (run === this.runId ? this.mount(data) : undefined), 0);
      },
      error: (err) => {
        if (run === this.runId) this.fail(errorMessage(err, 'Payment could not be started.'));
      },
    });
  }

  private mount(data: PaymentStart): void {
    const host = this.mountEl()?.nativeElement;
    if (!host || !this.stripe) return this.fail('The payment form could not be shown. Please try again.');
    this.elements = this.stripe.elements({
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0F392B',
          colorText: '#1C1B19',
          colorDanger: '#A3301F',
          fontFamily: 'Jost, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          borderRadius: '12px',
          spacingUnit: '4px',
        },
      },
    });
    this.element = this.elements.create('payment', { layout: 'tabs' });
    this.element.on('ready', () => this.phase.set('ready'));
    this.element.on('change', (e) => this.complete.set(!!e.complete));
    this.element.on('loaderror', () => this.fail('The card form could not load. Please try again.'));
    this.element.mount(host);
  }

  async pay(): Promise<void> {
    const data = this.start();
    if (!this.stripe || !this.elements || !data || this.phase() !== 'ready') return;
    this.error.set(null);
    this.phase.set('paying');

    const { error, paymentIntent } = await this.stripe.confirmPayment({
      elements: this.elements,
      redirect: 'if_required', // cards never leave the page; 3-D Secure opens in a Stripe dialog
      confirmParams: { return_url: `${window.location.origin}/app/orders/${this.orderId()}` },
    });

    if (error) {
      // card declined, wrong CVC, authentication failed... Stripe's message is meant for the customer
      this.phase.set('ready');
      this.error.set(error.message || 'The payment was not accepted. Please try another card.');
      return;
    }
    await this.verify(paymentIntent?.id ?? data.paymentIntentId);
  }

  /** Ask OUR server (which asks Stripe) whether the money arrived; only then is the invoice marked paid. */
  private async verify(paymentIntentId: string, attempt = 0): Promise<void> {
    this.phase.set('checking');
    try {
      const result = await new Promise<{ paid: boolean; status: string; error?: string | null }>((resolve, reject) =>
        this.orders.confirmPayment(this.orderId(), paymentIntentId).subscribe({ next: (r) => resolve(r.data), error: reject }),
      );
      if (result.paid) {
        this.toast.success('Payment received. Thank you!');
        this.paid.emit();
        this.close();
        return;
      }
      // some payment methods take a few seconds to settle
      if (result.status === 'processing' && attempt < 6) {
        await new Promise((r) => setTimeout(r, 2000));
        return this.verify(paymentIntentId, attempt + 1);
      }
      this.phase.set('ready');
      this.error.set(result.error || 'The payment is not complete yet. If you were charged it will show up shortly.');
    } catch (err) {
      this.phase.set('ready');
      this.error.set(`${errorMessage(err)} If your card was charged, your order will update on its own in a moment.`);
    }
  }

  private fail(message: string): void {
    this.phase.set('failed');
    this.start.set(null);
    this.error.set(message);
  }

  close(): void {
    if (this.phase() === 'paying' || this.phase() === 'checking') return;
    this.closed.emit();
  }

  private teardown(resetPhase = true): void {
    try {
      this.element?.destroy();
    } catch {
      /* already gone */
    }
    this.element = null;
    this.elements = null;
    if (resetPhase) this.runId++;
  }
}
