import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/services/api.service';
import { ConfigService } from '../../../core/services/config.service';
import {
  googleRedirectUri,
  safeReturnUrl,
  startGoogleSignIn,
  takePendingGoogleAuth,
} from '../../../core/services/google-oauth';
import { GoogleButtonComponent } from '../../../shared/google-button.component';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, IonIcon, IonSpinner, GoogleButtonComponent],
  templateUrl: './login.page.html',
  styleUrl: '../auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  protected config = inject(ConfigService);

  email = signal('');
  password = signal('');
  showPassword = signal(false);
  submitting = signal(false);
  sendingReset = signal(false);
  error = signal<string | null>(null);
  info = signal<string | null>(null);
  submitted = signal(false);
  /** True while a Google callback is being exchanged for a session. */
  googleBusy = signal(false);
  busy = computed(() => this.submitting() || this.googleBusy());
  googleEnabled = computed(() => !!this.config.config()?.google?.enabled);

  /** The authorization code is single use, so the callback must never be processed twice. */
  private googleHandled = false;

  constructor() {
    this.config.load();
    void this.handleGoogleCallback();
  }

  startGoogle(): void {
    this.error.set(null);
    this.info.set(null);
    const clientId = this.config.config()?.google?.clientId;
    if (!clientId) {
      this.error.set('Google sign-in is not available right now.');
      return;
    }
    try {
      startGoogleSignIn(clientId, this.route.snapshot.queryParamMap.get('returnUrl'));
    } catch {
      this.error.set('Google sign-in could not be started. Please try again.');
    }
  }

  private async handleGoogleCallback(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const state = params.get('state');
    const googleError = params.get('error');
    if (this.googleHandled || (!googleError && !(code && state))) return;
    this.googleHandled = true;

    // Busy immediately so the buttons are disabled while we verify and exchange the code.
    if (!googleError) this.googleBusy.set(true);
    const pending = takePendingGoogleAuth();
    // Strip code/state/scope/error… from the address bar (keeping a safe returnUrl for retries).
    const keepReturn = pending?.returnUrl ?? safeReturnUrl(params.get('returnUrl'));
    await this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: keepReturn ? { returnUrl: keepReturn } : {},
    });

    if (googleError) {
      this.error.set('Google sign-in was cancelled.');
      return;
    }
    if (!pending || !state || pending.state !== state) {
      this.googleBusy.set(false);
      this.error.set('Google sign-in could not be verified. Please try again.');
      return;
    }

    try {
      const user = await this.auth.googleLogin(code!, googleRedirectUri());
      this.toast.success(`Welcome back${user.full_name ? ', ' + user.full_name.split(' ')[0] : ''}!`);
      await this.router.navigateByUrl(pending.returnUrl ?? '/app/overview');
    } catch (err) {
      // Includes the staff-account message raised by AuthService.acceptSession.
      this.error.set(errorMessage(err));
    } finally {
      this.googleBusy.set(false);
    }
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    this.info.set(null);
    if (!this.email().trim() || !this.password()) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.submitting.set(true);
    try {
      const user = await this.auth.login(this.email(), this.password());
      this.toast.success(`Welcome back${user.full_name ? ', ' + user.full_name.split(' ')[0] : ''}!`);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const target = returnUrl && returnUrl.startsWith('/app') ? returnUrl : '/app/overview';
      await this.router.navigateByUrl(target);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }

  async forgot(): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    const email = this.email().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Enter your email address above first, then tap “Forgot password?”.');
      return;
    }
    this.sendingReset.set(true);
    try {
      this.info.set(await this.auth.forgotPassword(email));
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.sendingReset.set(false);
    }
  }
}
