import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { startGoogleSignIn } from '../../../core/services/google-oauth';
import { GoogleButtonComponent } from '../../../shared/google-button.component';
import { ConfigService } from '../../../core/services/config.service';
import { errorMessage } from '../../../core/services/api.service';
import { COUNTRIES, passwordStrength } from './register.data';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, IonIcon, IonSpinner, GoogleButtonComponent],
  templateUrl: './register.page.html',
  styleUrl: '../auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  protected config = inject(ConfigService);

  readonly countries = COUNTRIES;

  fullName = signal('');
  email = signal('');
  phone = signal('');
  country = signal('');
  otherCountry = signal('');
  city = signal('');
  address = signal('');
  password = signal('');
  confirm = signal('');
  terms = signal(false);
  showPassword = signal(false);

  submitting = signal(false);
  submitted = signal(false);
  error = signal<string | null>(null);

  strength = computed(() => passwordStrength(this.password()));
  countryValue = computed(() => (this.country() === 'Other' ? this.otherCountry().trim() : this.country()));

  errors = computed(() => {
    const e: Record<string, string> = {};
    if (this.fullName().trim().length < 2) e['fullName'] = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) e['email'] = 'Enter a valid email address.';
    if (this.phone().replace(/\D/g, '').length < 7) e['phone'] = 'Enter a phone number with country code.';
    if (!this.countryValue()) e['country'] = 'Choose your country.';
    if (!this.city().trim()) e['city'] = 'Enter your city.';
    if (this.address().trim().length < 5) e['address'] = 'Enter your delivery address.';
    if (this.password().length < 8) e['password'] = 'Use at least 8 characters.';
    if (this.confirm() !== this.password()) e['confirm'] = 'Passwords do not match.';
    if (!this.terms()) e['terms'] = 'Please accept the terms to continue.';
    return e;
  });

  constructor() {
    this.config.load();
  }

  /** Starts the same Google flow as the login page, which processes the callback. */
  startGoogle(): void {
    const clientId = this.config.config()?.google?.clientId;
    if (!clientId) {
      this.error.set('Google sign-in is not available right now.');
      return;
    }
    try {
      startGoogleSignIn(clientId);
    } catch {
      this.error.set('Google sign-in could not be started. Please try again.');
    }
  }

  err(key: string): string | null {
    return this.submitted() ? (this.errors()[key] ?? null) : null;
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (Object.keys(this.errors()).length) {
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    this.submitting.set(true);
    try {
      const { user, message } = await this.auth.register({
        fullName: this.fullName().trim(),
        email: this.email().trim(),
        phone: this.phone().trim(),
        country: this.countryValue(),
        city: this.city().trim(),
        address: this.address().trim(),
        password: this.password(),
      });
      if (!user) {
        // Email confirmation required before the first login.
        this.toast.info(message || 'Account created. Please verify your email, then sign in.', 6000);
        await this.router.navigateByUrl('/login');
        return;
      }
      this.toast.success(`Welcome! Your customer code is ${user.customer_code}.`, 5000);
      await this.router.navigateByUrl('/app/overview');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
