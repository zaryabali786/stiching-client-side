import { signal } from '@angular/core';
import { Observable, Subject, Subscription, catchError, map, of, switchMap } from 'rxjs';
import { Paged } from '../models/api.models';

export type PageFetch<T> = (page: number, search: string) => Observable<Paged<T>>;

type Outcome<T> = { page: number; search: string; res: Paged<T> } | { page: number; search: string; error: string };

/**
 * Server-side search + pagination state for one list. Every request goes through a single `switchMap`,
 * so a slow earlier search (or page) can never overwrite a newer one.
 */
export class SearchPager<T extends { id: string }> {
  readonly items = signal<T[]>([]);
  /** First page of the current search is loading. */
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly moreError = signal<string | null>(null);
  readonly hasMore = signal(false);
  /** The search the current items belong to (equals `search` once its first page arrived). */
  readonly appliedSearch = signal('');

  private page = 0;
  private search = '';
  private readonly requests$ = new Subject<{ page: number; search: string }>();
  private readonly sub: Subscription;

  constructor(private readonly source: () => PageFetch<T>) {
    this.sub = this.requests$
      .pipe(
        switchMap(({ page, search }) =>
          this.source()(page, search).pipe(
            map((res): Outcome<T> => ({ page, search, res })),
            catchError((err: unknown) => of<Outcome<T>>({ page, search, error: err instanceof Error ? err.message : 'Something went wrong.' })),
          ),
        ),
      )
      .subscribe((out) => this.apply(out));
  }

  /** Start again from page 1 for `search`. */
  reset(search = ''): void {
    this.search = search;
    this.page = 0;
    this.items.set([]);
    this.hasMore.set(false);
    this.error.set(null);
    this.moreError.set(null);
    this.loadingMore.set(false);
    this.loading.set(true);
    this.requests$.next({ page: 1, search });
  }

  loadMore(): void {
    if (this.page === 0 || !this.hasMore() || this.loading() || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.moreError.set(null);
    this.requests$.next({ page: this.page + 1, search: this.search });
  }

  /** Retry whichever request failed last. */
  retry(): void {
    if (this.error() || this.page === 0) this.reset(this.search);
    else this.loadMore();
  }

  destroy(): void {
    this.sub.unsubscribe();
  }

  private apply(out: Outcome<T>): void {
    if (out.search !== this.search) return;
    const first = out.page === 1;
    if ('error' in out) {
      if (first) this.error.set(out.error);
      else this.moreError.set(out.error);
      this.loading.set(false);
      this.loadingMore.set(false);
      return;
    }
    const { items, meta } = out.res;
    this.page = out.page;
    if (first) this.items.set(items);
    else {
      const seen = new Set(this.items().map((i) => i.id));
      this.items.update((list) => [...list, ...items.filter((i) => !seen.has(i.id))]);
    }
    this.hasMore.set(meta.hasMore ?? out.page < (meta.totalPages ?? 1));
    this.appliedSearch.set(out.search);
    this.loading.set(false);
    this.loadingMore.set(false);
  }
}
