import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable, finalize, map, shareReplay, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEnvelope, AuthPayload } from '../models/api.models';
import { TokenStorage } from './token-storage.service';

/**
 * Calls POST /auth/refresh with a raw HttpClient (bypasses interceptors).
 * Concurrent 401s share one in-flight refresh request.
 */
@Injectable({ providedIn: 'root' })
export class SessionRefreshService {
  private http = new HttpClient(inject(HttpBackend));
  private store = inject(TokenStorage);
  private inFlight$: Observable<string> | null = null;

  /** Emits the new access token, or errors when the session cannot be refreshed. */
  refresh(): Observable<string> {
    if (this.inFlight$) return this.inFlight$;
    const refreshToken = this.store.refreshToken;
    if (!refreshToken) return throwError(() => new Error('No refresh token'));

    this.inFlight$ = this.http
      .post<ApiEnvelope<AuthPayload>>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        map((res) => {
          const tokens = res.data?.tokens;
          if (!tokens?.accessToken) throw new Error('Refresh returned no token');
          this.store.setTokens(tokens);
          if (res.data.user) this.store.writeUser(res.data.user);
          return tokens.accessToken;
        }),
        finalize(() => (this.inFlight$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.inFlight$;
  }
}
