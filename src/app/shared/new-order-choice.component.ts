import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { AuthService } from '../core/services/auth.service';
import { NewOrderService } from '../core/services/new-order.service';
import { ToastService } from '../core/services/toast.service';
import { copyText } from '../core/utils/image';
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
      [eyebrow]="ui.view() === 'website' ? 'Direct from website' : 'New order'"
      [title]="ui.view() === 'website' ? 'Use these at checkout' : 'How are you ordering?'"
      (closed)="ui.close()"
    >
      @if (ui.view() === 'ask') {
        <div class="choices">
          <button type="button" class="opt" (click)="ui.view.set('website')">
            <span class="ico" aria-hidden="true"><ion-icon name="globe-outline"></ion-icon></span>
            <span class="txt"><strong>Direct from website</strong><small>Buy from a brand's website and have it sent to us.</small></span>
            <ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon>
          </button>
          <button type="button" class="opt" (click)="direct()">
            <span class="ico" aria-hidden="true"><ion-icon name="person-outline"></ion-icon></span>
            <span class="txt"><strong>Direct from customer</strong><small>You already have the fabric or parcel. Create the order yourself.</small></span>
            <ion-icon name="chevron-forward-outline" aria-hidden="true"></ion-icon>
          </button>
        </div>
      } @else {
        <p class="lead">When you checkout on any website, use this <b>email</b> and <b>shipping address</b>.</p>
        <div class="mail">
          <span class="k">Your email</span>
          <div class="row">
            <strong>{{ email() || 'Not available yet' }}</strong>
            @if (email()) {
              <button type="button" class="link-btn" (click)="copyEmail()">
                <ion-icon [name]="copied() ? 'checkmark-outline' : 'copy-outline'" aria-hidden="true"></ion-icon> {{ copied() ? 'Copied' : 'Copy' }}
              </button>
            }
          </div>
        </div>
        <app-ship-to-card eyebrow="Shipping address" heading="Deliver to" [compact]="true" />
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
      display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px; text-align: left;
      border: 1px solid var(--c-line-strong); border-radius: 18px; background: var(--c-surface);
      color: var(--c-ink); font: inherit; cursor: pointer;
    }
    .opt:hover { border-color: var(--c-brand); }
    .ico {
      flex: none; width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
      background: var(--c-surface-3); color: var(--c-brand); font-size: 24px;
    }
    .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .txt strong { font-size: 16px; }
    .txt small { color: var(--c-muted); }
    .lead { margin: 0 0 12px; line-height: 1.5; }
    .mail { margin-bottom: 12px; padding: 12px 14px; border: 1.5px dashed var(--c-line-strong); border-radius: 14px; display: flex; flex-direction: column; gap: 4px; }
    .k { font-size: var(--fs-2xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--c-muted); font-weight: 600; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .row strong { min-width: 0; overflow-wrap: anywhere; }
    .foot { display: flex; gap: 10px; }
    .foot .btn { flex: 1; }
  `,
})
export class NewOrderChoiceComponent {
  protected ui = inject(NewOrderService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected email = computed(() => this.auth.user()?.mailbox_address ?? null);
  protected copied = signal(false);

  protected direct(): void {
    this.ui.close();
    void this.router.navigate(['/app/orders/new']);
  }

  protected async copyEmail(): Promise<void> {
    const mail = this.email();
    if (!mail) return;
    if (await copyText(mail)) {
      this.copied.set(true);
      this.toast.success('Email copied.');
      setTimeout(() => this.copied.set(false), 2000);
    } else this.toast.error('Could not copy — please select the email manually.');
  }
}
