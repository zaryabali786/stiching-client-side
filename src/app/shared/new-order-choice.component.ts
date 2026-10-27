import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { NewOrderService } from '../core/services/new-order.service';
import { SheetComponent } from './sheet.component';
import { ShipToCardComponent } from './ship-to-card.component';

/**
 * Popup shown when the customer taps "New order". It stays on the current page: "Direct from website" shows the email and
 * shipping address to use at a brand's checkout; "Direct from customer" goes on to the order form.
 */
@Component({
  selector: 'app-new-order-choice',
  imports: [IonIcon, SheetComponent, ShipToCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet
      [open]="ui.isOpen()"
      look="choice"
      [eyebrow]="ui.view() === 'website' ? 'Place Order on Any Brand Website' : 'New order'"
      [title]="ui.view() === 'website' ? 'Use these at checkout' : 'How are you ordering?'"
      (closed)="ui.close()"
    >
      @if (ui.view() === 'ask') {
        <div class="choices">
          <button type="button" class="opt" (click)="ui.view.set('website')">
            <span class="ico" aria-hidden="true"><ion-icon name="globe-outline"></ion-icon></span>
            <span class="txt"><strong>Place Order on Any Brand Website</strong><small>Buy from a brand's website and have it sent to us.</small></span>
            <ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon>
          </button>
          <button type="button" class="opt" (click)="direct()">
            <span class="ico" aria-hidden="true"><ion-icon name="person-outline"></ion-icon></span>
            <span class="txt"><strong>Direct from customer</strong><small>You already have the fabric or parcel. Create the order yourself.</small></span>
            <ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon>
          </button>
        </div>
      } @else {
        <ul class="steps">
          <li>Use this <b>email</b> and <b>shipping address</b> at the brand's website checkout.</li>
          <li>Pay online at the brand's checkout, or choose <b>Cash on Delivery</b>: it is <b>allowed</b> for these orders.</li>
          <li>For a <b>Cash on Delivery</b> order you <b>pay the order total to us first</b>, here in your customer portal with Stripe. After the payment is confirmed you can create and edit the order.</li>
          <li>After you place the order, <b>check your customer portal</b>. Your order arrives there as a draft: choose <b>COD</b> or <b>Non-COD</b>, then complete the sizes and customization details.</li>
        </ul>
        <app-ship-to-card eyebrow="Shipping address" heading="Deliver to" [compact]="true" [showEmail]="true" />
      }
      @if (ui.view() === 'website') {
        <div sheet-footer class="foot">
          <button type="button" class="btn btn-outline" (click)="ui.view.set('ask')">Back</button>
          <button type="button" class="btn btn-primary" (click)="ui.close()">Done</button>
        </div>
      }
    </app-sheet>
  `,
  styles: `
    :host { display: contents; }
    .choices { display: flex; flex-direction: column; gap: 12px; }
    .opt {
      display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 14px; text-align: left;
      border: 1px solid #E4E4E7; border-radius: 12px; background: #fff; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
      color: var(--c-ink); font: inherit; cursor: pointer;
    }
    .opt:hover { border-color: #62003E; }
    .opt > ion-icon { flex: none; color: #27272a; font-size: 16px; }
    .ico {
      flex: none; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
      background: transparent; color: #111827; font-size: 30px;
    }
    .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .txt strong { font-size: 14px; font-weight: 600; color: #111827; }
    .txt small { color: #52525b; font-size: 11px; line-height: 1.35; }
    .steps { margin: 0 0 14px; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; line-height: 1.5; }
    .steps li::marker { color: var(--c-brand); }
    .foot { display: flex; gap: 10px; }
    .foot .btn { flex: 1; }
  `,
})
export class NewOrderChoiceComponent {
  protected ui = inject(NewOrderService);
  private router = inject(Router);

  protected direct(): void {
    this.ui.close();
    void this.router.navigate(['/app/orders/new']);
  }
}
