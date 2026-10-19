import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonSpinner } from '@ionic/angular';
import { AuthService } from '../core/services/auth.service';
import { errorMessage } from '../core/services/api.service';
import { safeReturnUrl } from '../core/services/google-oauth';
import { AppleSignInCancelled, isIosApp, nativeAppleIdToken } from '../core/services/native-oauth';
import { ToastService } from '../core/services/toast.service';

/** "Continue with Apple": shown in the iPhone app only (Apple requires it next to any other social sign-in). */
@Component({
  selector: 'app-apple-button',
  imports: [IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      @if (divider()) {
        <div class="or-divider" role="separator"><span>or</span></div>
      }
      <button type="button" class="btn btn-apple btn-block" [disabled]="disabled() || busy()" (click)="signIn()">
        @if (busy()) {
          <ion-spinner name="crescent"></ion-spinner> Signing in with Apple…
        } @else {
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"
            />
          </svg>
          Continue with Apple
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .or-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 18px 0 14px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .or-divider::before,
    .or-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--line);
    }
    .btn-apple {
      --btn-bg: #000000;
      --btn-fg: #ffffff;
      --btn-border: #000000;
      margin-top: 10px;
      letter-spacing: 0.02em;
      text-transform: none;
      font-size: 14px;
    }
  `,
})
export class AppleButtonComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  /** True when the Google button above already drew the "or" divider, so this one must not draw a second. */
  divider = input(false);
  disabled = input(false);
  failed = output<string>();

  protected visible = isIosApp();
  protected busy = signal(false);

  async signIn(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const { idToken, name } = await nativeAppleIdToken();
      const user = await this.auth.appleLoginWithIdToken(idToken, name);
      this.toast.success(`Welcome back${user.full_name ? ', ' + user.full_name.split(' ')[0] : ''}!`);
      await this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ?? '/app/overview');
    } catch (err) {
      if (!(err instanceof AppleSignInCancelled)) this.failed.emit(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
