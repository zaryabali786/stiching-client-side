import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { Subject, switchMap, map, catchError, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { OrderService } from '../../core/services/order.service';
import { OrderEventsService } from '../../core/services/order-events.service';
import { ClientOverview, OrderListRow } from '../../core/models/api.models';
import { ShipToCardComponent } from '../../shared/ship-to-card.component';
import { StatusBadgeComponent, brandSwatch } from '../../shared/status-badge.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui-states';

type Period = 'year' | 'all';

@Component({
  selector: 'app-overview',
  imports: [
    RouterLink,
    DatePipe,
    IonIcon,
    ShipToCardComponent,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPage {
  protected auth = inject(AuthService);
  private orders = inject(OrderService);
  private events = inject(OrderEventsService);
  private destroyRef = inject(DestroyRef);

  readonly year = new Date().getFullYear();
  period = signal<Period>('year');

  overview = signal<ClientOverview | null>(null);
  overviewLoading = signal(true);
  overviewError = signal<string | null>(null);

  recent = signal<OrderListRow[]>([]);
  recentTotal = signal(0);
  recentLoading = signal(true);
  recentError = signal<string | null>(null);

  firstName = computed(() => {
    const u = this.auth.user();
    return (u?.full_name || u?.email || '').split(' ')[0];
  });

  greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });

  /** One short line under the greeting — points at what matters right now. */
  heroLine = computed(() => {
    const n = this.overview()?.actionNeeded?.length ?? 0;
    if (n === 0) return 'Here’s where your outfits are.';
    return n === 1 ? 'One thing needs you first.' : 'A few things need you first.';
  });

  hasChartData = computed(() => (this.overview()?.monthly ?? []).some((m) => m.count > 0));
  chartRange = computed(() => {
    const m = this.overview()?.monthly ?? [];
    return m.length ? `${m[0].month} – ${m[m.length - 1].month}` : '';
  });

  currentMonthKey = computed(() => new Date().toISOString().slice(0, 7));
  activeBarMonth = signal<string | null>(null);

  monthlyTotal = computed(() => {
    return (this.overview()?.monthly ?? []).reduce((acc, m) => acc + (m.count || 0), 0);
  });

  highestMonth = computed(() => {
    const list = this.overview()?.monthly ?? [];
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => b.count - a.count);
    return sorted[0].count > 0 ? sorted[0] : null;
  });

  hoverBar(key: string | null): void {
    this.activeBarMonth.set(key);
  }

  private overview$ = new Subject<Period>();

  constructor() {
    // switchMap → toggling the period quickly never shows stale numbers
    this.overview$
      .pipe(
        switchMap((period) =>
          this.orders.overview(period).pipe(
            map((data) => ({ data, error: null as string | null })),
            catchError((err: Error) => of({ data: null, error: err.message })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ data, error }) => {
        this.overviewLoading.set(false);
        this.overviewError.set(error);
        if (data) this.overview.set(data);
      });

    this.loadOverview();
    this.loadRecent();

    // A status change somewhere: refresh the numbers and the recent orders without flashing skeletons.
    this.events.updated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.overview$.next(this.period());
      this.orders
        .list({ page: 1, limit: 3 })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ items, meta }) => {
            this.recent.set(items);
            this.recentTotal.set(meta.total);
          },
          error: () => undefined,
        });
    });
  }

  setPeriod(p: Period): void {
    if (p === this.period()) return;
    this.period.set(p);
    this.loadOverview();
  }

  loadOverview(): void {
    this.overviewLoading.set(true);
    this.overviewError.set(null);
    this.overview$.next(this.period());
  }

  loadRecent(): void {
    this.recentLoading.set(true);
    this.recentError.set(null);
    this.orders
      .list({ page: 1, limit: 3 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items, meta }) => {
          this.recent.set(items);
          this.recentTotal.set(meta.total);
          this.recentLoading.set(false);
        },
        error: (err: Error) => {
          this.recentError.set(err.message);
          this.recentLoading.set(false);
        },
      });
  }

  dismissWelcome(): void {
    this.auth.welcomeCode.set(null);
  }

  swatch(brand: string) {
    return brandSwatch(brand);
  }

  actionVerb(status: string): string {
    return status === 'draft' ? 'Complete' : status === 'customer_approval' ? 'Review' : 'Pay now';
  }
}
