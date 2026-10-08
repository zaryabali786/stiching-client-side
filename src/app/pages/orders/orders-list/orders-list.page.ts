import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { OrderEventsService } from '../../../core/services/order-events.service';
import { OrderListRow, Paged } from '../../../core/models/api.models';
import { StatusBadgeComponent, brandSwatch } from '../../../shared/status-badge.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';
import { InfiniteScrollDirective } from '../../../shared/infinite-scroll.directive';

type StatusFilter = 'all' | 'draft' | 'active' | 'completed';

interface ListRequest {
  page: number;
  search: string;
  status: StatusFilter;
}

interface ListResult {
  req: ListRequest;
  res?: Paged<OrderListRow>;
  error?: string;
}

const PAGE_SIZE = 10;

@Component({
  selector: 'app-orders-list',
  imports: [
    RouterLink,
    DatePipe,
    IonIcon,
    IonSpinner,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InfiniteScrollDirective,
  ],
  templateUrl: './orders-list.page.html',
  styleUrl: './orders-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersListPage {
  private orders = inject(OrderService);
  private events = inject(OrderEventsService);
  private destroyRef = inject(DestroyRef);

  readonly filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
  ];

  searchText = signal('');
  private search = signal('');
  status = signal<StatusFilter>('all');

  items = signal<OrderListRow[]>([]);
  total = signal<number | null>(null);
  counts = signal<Partial<Record<StatusFilter, number>>>({});
  hasMore = signal(false);
  page = signal(1);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal<string | null>(null);
  moreError = signal<string | null>(null);

  private requests$ = new Subject<ListRequest>();
  private searchInput$ = new Subject<string>();

  constructor() {
    // One pipeline for every page request: switchMap cancels stale ones, so results never arrive out of order.
    this.requests$
      .pipe(
        switchMap((req) =>
          this.orders.list({ page: req.page, limit: PAGE_SIZE, search: req.search, status: req.status }).pipe(
            map((res): ListResult => ({ req, res })),
            catchError((err: Error) => of<ListResult>({ req, error: err.message })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ req, res, error }) => {
        const firstPage = req.page === 1;
        this.loading.set(false);
        this.loadingMore.set(false);
        if (error || !res) {
          if (firstPage) this.error.set(error ?? 'Could not load orders.');
          else this.moreError.set(error ?? 'Could not load more orders.');
          return;
        }
        this.page.set(req.page);
        this.items.update((list) => (firstPage ? res.items : [...list, ...res.items.filter((o) => !list.some((x) => x.id === o.id))]));
        this.hasMore.set(res.meta.hasMore);
        this.total.set(res.meta.total);
      });

    this.searchInput$
      .pipe(
        map((s) => s.trim()),
        debounceTime(350),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => {
        if (s === this.search()) return;
        this.search.set(s);
        this.reload();
      });

    this.reload();

    // A status change somewhere: quietly reload the first page.
    this.events.updated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.requests$.next({ page: 1, search: this.search(), status: this.status() });
      this.loadCounts();
    });
  }

  onSearch(value: string): void {
    this.searchText.set(value);
    this.searchInput$.next(value);
  }

  clearSearch(): void {
    this.searchText.set('');
    this.searchInput$.next('');
    if (this.search()) {
      this.search.set('');
      this.reload();
    }
  }

  clearFilters(): void {
    this.searchText.set('');
    this.searchInput$.next('');
    this.search.set('');
    this.status.set('all');
    this.reload();
  }

  setStatus(s: StatusFilter): void {
    if (s === this.status()) return;
    this.status.set(s);
    this.reload();
  }

  private loadCounts(): void {
    this.orders
      .counts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (c) => this.counts.set(c), error: () => undefined });
  }

  reload(): void {
    this.loadCounts();
    this.loading.set(true);
    this.error.set(null);
    this.moreError.set(null);
    this.requests$.next({ page: 1, search: this.search(), status: this.status() });
  }

  loadMore(): void {
    if (!this.hasMore() || this.loading() || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.moreError.set(null);
    this.requests$.next({ page: this.page() + 1, search: this.search(), status: this.status() });
  }

  isFiltered(): boolean {
    return !!this.search() || this.status() !== 'all';
  }

  readonly steps = ['Placed', 'Tailoring', 'Ready', 'On the way'];

  kicker(o: OrderListRow): string {
    if (o.status === 'draft') return 'Draft Order';
    if (o.status === 'delivered') return 'Completed Order';
    if (o.status === 'cancelled') return 'Cancelled Order';
    return 'Active Order';
  }

  /** Which of the four journey steps the order is on (Placed, Tailoring, Ready, On the way). */
  progress(o: OrderListRow): { step: number; done: boolean; label: string } {
    const s = o.status;
    if (s === 'delivered') return { step: 3, done: true, label: 'Delivered' };
    let step = 0;
    if (['assigned', 'cutting', 'stitching', 'qc_passed', 'customer_approval'].includes(s)) step = 1;
    else if (['packed', 'invoice_issued', 'awaiting_payment', 'paid'].includes(s)) step = 2;
    else if (['at_admin_warehouse', 'partner_dispatch', 'shipped'].includes(s)) step = 3;
    return { step, done: false, label: 'Step ' + (step + 1) + ' of 4: ' + this.steps[step] };
  }

  swatch(brand: string) {
    return brandSwatch(brand);
  }
}
