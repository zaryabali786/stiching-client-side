import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NewOrderService } from '../../../core/services/new-order.service';
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
  protected newOrder = inject(NewOrderService);
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

  readonly steps = ['Order placed', 'Received', 'Tailoring', 'QC', 'Ready for dispatch', 'On the way', 'Delivered'];

  /** Short words for the return badge and the line under the order. */
  returnInfo(o: OrderListRow): { label: string; icon: string; tone: 'warn' | 'info' | 'ok'; note: string } | null {
    const b = o.return_badge;
    if (!b) return null;
    const what = b.whole_parcel ? 'Whole parcel' : `${b.count} of ${b.total} article${b.total === 1 ? '' : 's'}`;
    const where = b.to === 'brand' ? 'Returning to Brand' : b.to === 'customer' ? 'Returning to Customer' : 'Return destination to be confirmed';
    if (b.status === 'requested') return { label: 'Return Requested', icon: 'return-up-back-outline', tone: 'warn', note: `${what} · ${where}` };
    if (b.status === 'on_hold') return { label: 'On Hold', icon: 'pause-circle-outline', tone: 'warn', note: `${what} · kept with us until you decide` };
    if (b.status === 'in_progress') return { label: 'Return in Progress', icon: 'cube-outline', tone: 'info', note: `${what} sent back · ${where}` };
    return { label: 'Return Completed', icon: 'checkmark-circle-outline', tone: 'ok', note: `${what} · corrected article received` };
  }

  /** "Aramex · Tracking 123456" lines for the return that was posted back. */
  returnShipments(o: OrderListRow): string[] {
    return (o.return_badge?.shipments ?? []).map((s) => [s.courier, s.tracking ? `Tracking ${s.tracking}` : ''].filter(Boolean).join(' · '));
  }

  /** Under a draft's own number: the Shopify order number (Shopify drafts only) and the brand, each only when known. */
  draftSubtitle(o: OrderListRow): string {
    const shopify = o.external_source === 'shopify' && o.brand_order_number?.trim() ? `Shopify Order ${o.brand_order_number.trim().replace(/^(?=\d)/, '#')}` : '';
    const brand = o.brand?.trim() ? `Brand: ${o.brand.trim()}` : '';
    return [shopify, brand].filter(Boolean).join(' · ');
  }

  kicker(o: OrderListRow): string {
    if (o.order_kind === 'return') return 'Return shipment';
    if (o.status === 'draft') return 'Draft Order';
    if (o.status === 'delivered') return 'Completed Order';
    if (o.status === 'cancelled') return 'Cancelled Order';
    return 'Active Order';
  }

  /** Which journey step the order is on (see `steps`). */
  progress(o: OrderListRow): { step: number; done: boolean; label: string } {
    const s = o.status;
    const last = this.steps.length - 1;
    if (s === 'delivered') return { step: last, done: true, label: 'Delivered' };
    let step = 0;
    if (['received', 'assigned'].includes(s)) step = 1;
    else if (['cutting', 'stitching'].includes(s)) step = 2;
    else if (['qc_passed', 'customer_approval'].includes(s)) step = 3;
    else if (['packed', 'invoice_issued', 'awaiting_payment', 'paid'].includes(s)) step = 4;
    else if (['at_admin_warehouse', 'partner_dispatch', 'shipped'].includes(s)) step = 5;
    return { step, done: false, label: 'Step ' + (step + 1) + ' of ' + this.steps.length + ': ' + this.steps[step] };
  }

  swatch(brand: string) {
    return brandSwatch(brand);
  }
}
