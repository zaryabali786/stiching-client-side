import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { OrderService } from '../../core/services/order.service';
import { OrderEventsService } from '../../core/services/order-events.service';
import { HomeLayoutService, HomeSection } from '../../core/services/home-layout.service';
import { ClientOverview } from '../../core/models/api.models';
import { HomeSectionsComponent } from '../../shared/home-sections.component';

@Component({
  selector: 'app-overview',
  imports: [IonIcon, HomeSectionsComponent],
  templateUrl: './overview.page.html',
  styleUrl: './overview.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPage {
  protected auth = inject(AuthService);
  private orders = inject(OrderService);
  private events = inject(OrderEventsService);
  private layout = inject(HomeLayoutService);
  private destroyRef = inject(DestroyRef);

  overview = signal<ClientOverview | null>(null);
  /** The sections the admin arranged for the home page. */
  sections = signal<HomeSection[]>([]);
  /** True until the home layout request finishes (success or failure), so a skeleton shows instead of a blank page. */
  sectionsLoading = signal(true);

  firstName = computed(() => {
    const u = this.auth.user();
    return (u?.full_name || u?.email || '').split(' ')[0] || 'there';
  });

  greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });

  actionNeeded = computed(() => this.overview()?.actionNeeded ?? []);
  inProgressCount = computed(() => this.overview()?.articlesInProgress ?? 0);

  constructor() {
    this.loadOverview();
    this.events.updated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadOverview());

    this.layout
      .sections()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.sections.set(rows);
          this.sectionsLoading.set(false);
        },
        error: () => this.sectionsLoading.set(false),
      });
  }

  private loadOverview(): void {
    this.orders
      .overview('year')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => this.overview.set(data), error: () => undefined });
  }

  dismissWelcome(): void {
    this.auth.welcomeCode.set(null);
  }
}
