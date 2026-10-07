import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { Observable, catchError, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStorage } from '../services/token-storage.service';
import { SessionRefreshService } from '../services/session-refresh.service';
import { AuthService } from '../services/auth.service';

/** Endpoints that never carry or refresh a session. */
const PUBLIC_AUTH = /\/auth\/(login|register|refresh|forgot-password)$/;

const withToken = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/**
 * Attaches the Bearer token to API calls. On 401: refreshes the session once (a single in-flight
 * refresh shared by concurrent requests) and retries; if the refresh fails the user is logged out
 * and sent to /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const path = req.url.split('?')[0];
  if (!req.url.startsWith(environment.apiUrl) || PUBLIC_AUTH.test(path)) return next(req);

  const store = inject(TokenStorage);
  const refresher = inject(SessionRefreshService);
  const injector = inject(Injector);
  const token = store.accessToken;
  if (!token) return next(req);

  const isLogout = path.endsWith('/auth/logout');

  return next(withToken(req, token)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || isLogout) {
        return throwError(() => err);
      }
      // If another request already refreshed the session meanwhile, just retry with the new token.
      const current = store.accessToken;
      const token$: Observable<string> = current && current !== token ? of(current) : refresher.refresh();

      return token$.pipe(
        catchError(() => {
          injector.get(AuthService).handleSessionExpired();
          return throwError(() => err);
        }),
        switchMap((newToken) => next(withToken(req, newToken))),
      );
    }),
  );
};
