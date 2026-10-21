import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/services/api.service';
import { ConfigService } from '../../../core/services/config.service';

/** Where the "reset your password" email lands: /reset-password?token=... The token is single use and only the server accepts it. */
@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink, IonIcon, IonSpinner],
  template: `
    <div class="auth-wrap">
      <section class="auth-hero">
        <div class="monogram">{{ (config.brandName() || '·').charAt(0) }}</div>
        <span class="eyebrow">{{ config.brandName() }}</span>
        <h1>Choose a new password</h1>
        <p>Pick a password you have not used before. You will sign in with it right after.</p>
      </section>

      <section class="auth-card">
        @if (!token()) {
          <div class="form-error" role="alert">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <span>This reset link is not valid. Ask for a new one from the sign-in page.</span>
          </div>
          <a class="btn btn-primary btn-block" routerLink="/login">Back to sign in</a>
        } @else if (done()) {
          <div class="form-error info" role="status">
            <ion-icon name="checkmark-circle-outline"></ion-icon>
            <span>Your password was changed. You can sign in now.</span>
          </div>
          <a class="btn btn-primary btn-block" routerLink="/login">Sign in</a>
        } @else {
          <form (ngSubmit)="submit()" novalidate>
            @if (error()) {
              <div class="form-error" role="alert">
                <ion-icon name="alert-circle-outline"></ion-icon>
                <span>{{ error() }}</span>
              </div>
            }
            <div class="field">
              <label for="np">New password</label>
              <div class="input-affix leading">
                <ion-icon class="affix-icon" name="lock-closed-outline"></ion-icon>
                <input id="np" class="input" [type]="show() ? 'text' : 'password'" name="password" autocomplete="new-password" placeholder="At least 8 characters" [class.invalid]="submitted() && tooShort()" [(ngModel)]="password" />
                <button type="button" class="affix-btn" (click)="show.set(!show())" [attr.aria-label]="show() ? 'Hide password' : 'Show password'">
                  <ion-icon [name]="show() ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
                </button>
              </div>
            </div>
            <div class="field">
              <label for="cp">Confirm password</label>
              <div class="input-affix leading">
                <ion-icon class="affix-icon" name="lock-closed-outline"></ion-icon>
                <input id="cp" class="input" [type]="show() ? 'text' : 'password'" name="confirm" autocomplete="new-password" placeholder="Type it again" [class.invalid]="submitted() && mismatch()" [(ngModel)]="confirm" />
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-block" [disabled]="submitting()">
              @if (submitting()) { <ion-spinner name="crescent"></ion-spinner> Saving… } @else { Change password <ion-icon name="arrow-forward-outline"></ion-icon> }
            </button>
          </form>
        }
      </section>
    </div>
  `,
  styleUrl: '../auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  protected config = inject(ConfigService);

  readonly token = signal(this.route.snapshot.queryParamMap.get('token') || '');
  password = signal('');
  confirm = signal('');
  show = signal(false);
  submitting = signal(false);
  submitted = signal(false);
  done = signal(false);
  error = signal<string | null>(null);
  tooShort = computed(() => this.password().length < 8);
  mismatch = computed(() => this.password() !== this.confirm());

  constructor() {
    this.config.load();
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.tooShort()) {
      this.error.set('Password must be at least 8 characters long.');
      return;
    }
    if (this.mismatch()) {
      this.error.set('The two passwords are not the same.');
      return;
    }
    this.submitting.set(true);
    try {
      await this.auth.resetPassword(this.token(), this.password());
      this.done.set(true);
      this.toast.success('Password changed.');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
