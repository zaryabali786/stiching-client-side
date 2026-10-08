import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast t-' + t.tone" role="status" (click)="toast.dismiss(t.id)">
          <ion-icon aria-hidden="true"
            [name]="t.tone === 'success' ? 'checkmark-circle-outline' : t.tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline'"
          ></ion-icon>
          <span class="msg">{{ t.message }}</span>
          @if (t.action; as a) {
            <button type="button" class="act" (click)="$event.stopPropagation(); a.run(); toast.dismiss(t.id)">{{ a.label }}</button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .toast-stack {
      position: fixed; z-index: 2000; left: 50%; transform: translateX(-50%);
      top: calc(10px + env(safe-area-inset-top, 0px));
      width: calc(100% - 24px); max-width: 456px;
      display: flex; flex-direction: column; gap: 8px; pointer-events: none;
    }
    @keyframes toast-in { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: none; } }
    .toast {
      pointer-events: auto; cursor: pointer;
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px; border-radius: 14px;
      background: var(--notif-fill, #1c2b23); color: var(--notif-text, var(--c-on-dark)); font-size: var(--fs-md); line-height: 1.4;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
      animation: toast-in 0.22s ease both;
    }
    .toast ion-icon { font-size: 19px; flex: none; margin-top: -1px; }
    .msg { flex: 1; min-width: 0; align-self: center; }
    .act {
      flex: none; min-height: 44px; margin: -10px -6px -10px 0; padding: 0 14px; border: 0; border-radius: 10px;
      background: rgba(255, 255, 255, 0.14); color: #fff; font-size: var(--fs-sm); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
    }
    .act:hover { background: rgba(255, 255, 255, 0.24); }
    .t-success ion-icon { color: #9ad3b2; }
    .t-error { background: #5a1f17; color: #fff; }
    .t-error ion-icon { color: #ffb4a6; }
    .t-info ion-icon { color: #e6cf9f; }
  `,
})
export class ToastHostComponent {
  protected toast = inject(ToastService);
}
