/**
 * Google OAuth authorization-code flow helpers (client side only holds the PUBLIC client id).
 * The only registered redirect URI is `${origin}/login`; the login page processes the callback.
 */
const STORAGE_KEY = 'google_oauth';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

interface PendingGoogleAuth {
  state: string;
  returnUrl: string | null;
}

export function googleRedirectUri(): string {
  return `${window.location.origin}/login`;
}

/** Only in-app paths may be used as a post-login destination. */
export function safeReturnUrl(value: string | null | undefined): string | null {
  return value && value.startsWith('/app') ? value : null;
}

/** Stores a fresh random state (+ return URL) and sends the browser to Google's consent screen. */
export function startGoogleSignIn(clientId: string, returnUrl?: string | null): void {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const pending: PendingGoogleAuth = { state, returnUrl: safeReturnUrl(returnUrl) };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  window.location.href = `${AUTH_URL}?${params.toString().replace(/\+/g, '%20')}`;
}

/** Reads and removes the stored pending auth (single use). */
export function takePendingGoogleAuth(): PendingGoogleAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingGoogleAuth>;
    if (typeof parsed.state !== 'string' || !parsed.state) return null;
    return { state: parsed.state, returnUrl: safeReturnUrl(parsed.returnUrl) };
  } catch {
    return null;
  }
}
