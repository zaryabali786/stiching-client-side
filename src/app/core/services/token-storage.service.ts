import { Injectable, signal } from '@angular/core';
import { AuthTokens, Profile } from '../models/api.models';

const TOKENS_KEY = 'stx_customer_tokens';
const USER_KEY = 'stx_customer_user';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) – keep in memory only */
  }
}

/**
 * Dependency-free holder for the session (so the HTTP interceptor can read tokens without a
 * circular dependency on AuthService).
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  readonly tokens = signal<AuthTokens | null>(read<AuthTokens>(TOKENS_KEY));

  get accessToken(): string | null {
    return this.tokens()?.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.tokens()?.refreshToken ?? null;
  }

  setTokens(tokens: AuthTokens | null): void {
    this.tokens.set(tokens);
    write(TOKENS_KEY, tokens);
  }

  readUser(): Profile | null {
    return read<Profile>(USER_KEY);
  }

  writeUser(user: Profile | null): void {
    write(USER_KEY, user);
  }

  clear(): void {
    this.setTokens(null);
    this.writeUser(null);
  }
}
