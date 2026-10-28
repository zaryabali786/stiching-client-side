import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ConfigService } from '../../../core/services/config.service';
import { errorMessage } from '../../../core/services/api.service';
import { safeReturnUrl } from '../../../core/services/google-oauth';
import { ToastService } from '../../../core/services/toast.service';

/**
 * Sign in without a password: the customer types their email, we send a 6-digit code, they type it. The button in the "add your
 * sizes" email opens this page with the email and a single-use token already filled in, and signs the customer in on its own.
 */
@Component({
  selector: 'app-sign-in-code',
  imports: [FormsModule, RouterLink, IonIcon, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../auth-layout.scss',
  template: `
    <div class="auth-wrap">
      <section class="auth-hero">
        <span class="brand-logo"><img src="assets/logo.png" [alt]="(config.brandName() || 'Company') + ' logo'" width="64" height="64" /></span>
        <span class="eyebrow">{{ config.brandName() }} · Bespoke stitching from Pakistan</span>
        <h1>Sign in with a code</h1>
        <p>Use the email address you used when you placed your order. We send you a code, no password needed.</p>
      </section>

      <section class="auth-card">
        @if (auto()) {
          <p class="muted" role="status"><ion-spinner name="crescent"></ion-spinner> Signing you in…</p>
        } @else {
          <form (ngSubmit)="step() === 'email' ? sendCode() : verify()" novalidate>
            @if (error()) {
              <div class="form-error" role="alert"><ion-icon name="alert-circle-outline"></ion-icon><span>{{ error() }}</span></div>
            }
            @if (info()) {
              <div class="form-error info" role="status"><ion-icon name="mail-outline"></ion-icon><span>{{ info() }}</span></div>
            }

            <div class="field">
              <label for="sc-email">Email</label>
              <div class="input-affix leading">
                <ion-icon class="affix-icon" name="mail-outline"></ion-icon>
                <input id="sc-email" class="input" type="email" name="email" autocomplete="email" inputmode="email" placeholder="you@example.com" [disabled]="step() === 'code'" [(ngModel)]="email" />
              </div>
            </div>

            @if (step() === 'code') {
              <div class="field">
                <label for="sc-code">6-digit code</label>
                <input id="sc-code" class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" [(ngModel)]="code" />
              </div>
            }

            <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()">
              @if (busy()) {
                <ion-spinner name="crescent"></ion-spinner>
              } @else {
                {{ step() === 'email' ? 'Send me a code' : 'Sign in' }} <ion-icon name="arrow-forward-outline"></ion-icon>
              }
            </button>
            @if (step() === 'code') {
              <div class="forgot-row">
                <button type="button" (click)="step.set('email'); code.set(''); error.set(null)">Use a different email</button>
                <button type="button" (click)="sendCode()" [disabled]="busy()">Send a new code</button>
              </div>
            }
          </form>
        }
      </section>

      <p class="auth-switch">Prefer a password?<a routerLink="/login">Sign in</a></p>
    </div>
  `,
})
export class SignInCodePage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  protected config = inject(ConfigService);

  email = signal('');
  code = signal('');
  step = signal<'email' | 'code'>('email');
  busy = signal(false);
  auto = signal(false);
  error = signal<string | null>(null);
  info = signal<string | null>(null);

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const email = (q.get('email') || '').trim();
    const token = q.get('token');
    if (email) this.email.set(email);
    if (email && token) void this.signInWithToken(email, token);
  }

  private async finish(): Promise<void> {
    const next = safeReturnUrl(this.route.snapshot.queryParamMap.get('next')) ?? '/app/overview';
    await this.router.navigateByUrl(next, { replaceUrl: true });
  }

  /** The button in the email: the single-use token signs the customer in. If it does not work, the page asks for a code instead. */
  private async signInWithToken(email: string, token: string): Promise<void> {
    this.auto.set(true);
    try {
      await this.auth.verifyLoginCode({ email, token });
      this.toast.success('Welcome!');
      await this.finish();
    } catch {
      this.auto.set(false);
      this.info.set('That link has expired or was already used. We can send you a code instead.');
    }
  }

  async sendCode(): Promise<void> {
    const email = this.email().trim();
    if (!email) {
      this.error.set('Enter your email address.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const message = await this.auth.requestLoginCode(email);
      this.info.set(message);
      this.step.set('code');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async verify(): Promise<void> {
    const code = this.code().trim();
    if (!/^\d{6}$/.test(code)) {
      this.error.set('Enter the 6-digit code from your email.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.verifyLoginCode({ email: this.email().trim(), code });
      this.toast.success('Welcome!');
      await this.finish();
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
