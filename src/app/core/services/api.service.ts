import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEnvelope, ApiResult, Paged, QueryParams } from '../models/api.models';

/** Error thrown by every ApiService call. `message` is the human readable API message. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Turn anything thrown by an API call into a user-facing message. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  return fallback;
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return new ApiError('Cannot reach the server. Check your internet connection and try again.', 0);
    }
    const body = err.error as Partial<ApiEnvelope<unknown>> | null;
    const apiMessage = body && typeof body === 'object' && typeof body.message === 'string' ? body.message : '';
    const message =
      apiMessage ||
      (err.status >= 500 ? 'The server had a problem. Please try again in a moment.' : err.statusText) ||
      'Request failed.';
    return new ApiError(message, err.status, body && typeof body === 'object' ? body.details : undefined);
  }
  return new ApiError(errorMessage(err), -1);
}

/**
 * Thin typed wrapper around HttpClient that unwraps the `{ success, statusCode, message, data, meta }`
 * envelope and converts failures into ApiError (carrying the API `message`).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  readonly baseUrl = environment.apiUrl;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(this.url(path), { params: this.params(params) })
      .pipe(map((res) => res.data), catchError(this.fail));
  }

  getPage<T, M extends object = object>(path: string, params?: QueryParams): Observable<Paged<T, M>> {
    return this.http.get<ApiEnvelope<T[]>>(this.url(path), { params: this.params(params) }).pipe(
      map((res) => ({
        items: Array.isArray(res.data) ? res.data : [],
        meta: (res.meta ?? { page: 1, limit: 0, total: 0, totalPages: 1, hasMore: false }) as Paged<T, M>['meta'],
      })),
      catchError(this.fail),
    );
  }

  post<T = null>(path: string, body: unknown = {}): Observable<ApiResult<T>> {
    return this.http.post<ApiEnvelope<T>>(this.url(path), body).pipe(map(toResult<T>), catchError(this.fail));
  }

  patch<T = null>(path: string, body: unknown = {}): Observable<ApiResult<T>> {
    return this.http.patch<ApiEnvelope<T>>(this.url(path), body).pipe(map(toResult<T>), catchError(this.fail));
  }

  put<T = null>(path: string, body: unknown = {}): Observable<ApiResult<T>> {
    return this.http.put<ApiEnvelope<T>>(this.url(path), body).pipe(map(toResult<T>), catchError(this.fail));
  }

  delete<T = null>(path: string): Observable<ApiResult<T>> {
    return this.http.delete<ApiEnvelope<T>>(this.url(path)).pipe(map(toResult<T>), catchError(this.fail));
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private params(params?: QueryParams): HttpParams {
    let p = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      p = p.set(key, String(value));
    }
    return p;
  }

  private fail = (err: unknown) => throwError(() => toApiError(err));
}

function toResult<T>(res: ApiEnvelope<T>): ApiResult<T> {
  return { data: res.data, message: res.message };
}
