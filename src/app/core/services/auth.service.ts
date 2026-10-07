import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, ApiError } from './api.service';
import { TokenStorage } from './token-storage.service';
import { ToastService } from './toast.service';
import { AuthPayload, Profile, ProfilePatch, RegisterBody } from '../models/api.models';

export const STAFF_ACCOUNT_MESSAGE = 'This is a staff account — use the admin/partner portal.';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private store = inject(TokenStorage);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** The signed-in customer (restored from storage, then refreshed from GET /auth/me). */
  readonly user = signal<Profile | null>(this.store.readUser());
  readonly isAuthenticated = computed(() => !!this.store.tokens() && this.user()?.role === 'customer');
  /** Set after a successful registration so the overview can greet the new customer with their code. */
  readonly welcomeCode = signal<string | null>(null);

  /** Resolves once the stored session has been validated (used by guards). */
  private readyPromise: Promise<void> = Promise.resolve();
  private expiring = false;

  /** Called once on app start. */
  init(): void {
    if (!this.store.tokens()) {
      this.user.set(null);
      return;
    }
    const validation = this.refreshMe().then(
      () => undefined,
      () => undefined,
    );
    // With a cached profile the app can render immediately; otherwise guards wait for /auth/me.
    this.readyPromise = this.user() ? Promise.resolve() : validation;
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  async refreshMe(): Promise<Profile | null> {
    try {
      const { user } = await firstValueFrom(this.api.get<{ user: Profile }>('/auth/me'));
      if (user.role !== 'customer') {
        this.clearSession();
        this.toast.error(STAFF_ACCOUNT_MESSAGE);
        return null;
      }
      this.setUser(user);
      return user;
    } catch (err) {
      // 401s are handled by the interceptor (refresh or logout). Network errors keep the cached session.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) this.clearSession();
      throw err;
    }
  }

  async login(email: string, password: string): Promise<Profile> {
    const { data } = await firstValueFrom(
      this.api.post<AuthPayload>('/auth/login', { email: email.trim().toLowerCase(), password }),
    );
    return this.acceptSession(data);
  }

  /** Exchanges a Google authorization code (the backend holds the client secret) for a session. */
  async googleLogin(code: string, redirectUri: string): Promise<Profile> {
    const { data } = await firstValueFrom(
      this.api.post<AuthPayload>('/auth/google', { code, redirectUri, portal: 'customer' }),
    );
    return this.acceptSession(data);
  }

  /** Returns the profile, or null when the account needs email verification before login. */
  async register(body: RegisterBody): Promise<{ user: Profile | null; message: string }> {
    const { data, message } = await firstValueFrom(
      this.api.post<AuthPayload>('/auth/register', {
        ...body,
        email: body.email.trim().toLowerCase(),
        portal: 'customer',
      }),
    );
    if (!data.tokens) return { user: null, message };
    const user = await this.acceptSession(data);
    this.welcomeCode.set(user.customer_code);
    return { user, message };
  }

  async logout(): Promise<void> {
    if (this.store.tokens()) {
      try {
        await firstValueFrom(this.api.post('/auth/logout'));
      } catch {
        /* ignore – we clear locally anyway */
      }
    }
    this.clearSession();
    await this.router.navigateByUrl('/login');
  }

  async updateProfile(patch: ProfilePatch): Promise<string> {
    const { data, message } = await firstValueFrom(this.api.patch<{ user: Profile }>('/auth/me', patch));
    this.setUser(data.user);
    return message;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<string> {
    const { message } = await firstValueFrom(
      this.api.post('/auth/change-password', { currentPassword, newPassword }),
    );
    return message;
  }

  async forgotPassword(email: string): Promise<string> {
    const { message } = await firstValueFrom(
      this.api.post('/auth/forgot-password', { email: email.trim().toLowerCase(), portal: 'customer' }),
    );
    return message;
  }

  /** Called by the interceptor when the refresh token is no longer valid. */
  handleSessionExpired(): void {
    if (this.expiring) return;
    this.expiring = true;
    const hadSession = !!this.user();
    this.clearSession();
    const current = this.router.url;
    const onAuthPage = current.startsWith('/login') || current.startsWith('/register');
    if (hadSession) this.toast.info('Your session expired. Please sign in again.');
    const nav = onAuthPage
      ? Promise.resolve(true)
      : this.router.navigate(['/login'], { queryParams: { returnUrl: current } });
    nav.finally(() => (this.expiring = false));
  }

  private async acceptSession(data: AuthPayload): Promise<Profile> {
    this.store.setTokens(data.tokens);
    if (data.user.role !== 'customer') {
      // Staff accounts belong to the admin/partner portal: end that session immediately.
      try {
        await firstValueFrom(this.api.post('/auth/logout'));
      } catch {
        /* ignore */
      }
      this.clearSession();
      throw new ApiError(STAFF_ACCOUNT_MESSAGE, 403);
    }
    this.setUser(data.user);
    return data.user;
  }

  private setUser(user: Profile): void {
    this.user.set(user);
    this.store.writeUser(user);
  }

  private clearSession(): void {
    this.store.clear();
    this.user.set(null);
    this.welcomeCode.set(null);
  }
}
