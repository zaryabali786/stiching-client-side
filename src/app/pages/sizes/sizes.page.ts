import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { SizeService } from '../../core/services/size.service';
import { ToastService } from '../../core/services/toast.service';
import { SizeChart } from '../../core/models/api.models';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui-states';
import { SizeViewComponent } from '../../shared/size-view.component';
import { VoicePlayerComponent } from '../../shared/voice-player.component';
import { SizeChartFormComponent } from './components/size-chart-form/size-chart-form.component';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

@Component({
  selector: 'app-sizes',
  imports: [
    DatePipe,
    IonIcon,
    IonSpinner,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SizeViewComponent,
    VoicePlayerComponent,
    SizeChartFormComponent,
  ],
  templateUrl: './sizes.page.html',
  styleUrl: './sizes.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SizesPage {
  private sizes = inject(SizeService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private tabsEl = viewChild<ElementRef<HTMLElement>>('tabs');

  /** `?person=` (component input binding): the selected person is kept in the URL. */
  readonly person = input<string>();

  charts = signal<SizeChart[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  /** Chosen variation (null = the person's first). */
  private chartId = signal<string | null>(null);

  // form
  formOpen = signal(false);
  editing = signal<SizeChart | null>(null);
  copyFrom = signal<SizeChart | null>(null);
  lockPerson = signal(false);
  defaultPerson = signal('');

  confirmDelete = signal(false);
  deleting = signal(false);

  /** People in the order their first chart was created. */
  people = computed(() => {
    const seen: string[] = [];
    for (const c of this.charts()) {
      const p = c.person_name || 'Unnamed';
      if (!seen.includes(p)) seen.push(p);
    }
    return seen;
  });

  selectedPerson = computed(() => {
    const wanted = this.person();
    const all = this.people();
    return wanted && all.includes(wanted) ? wanted : (all[0] ?? null);
  });

  personCharts = computed(() => {
    const p = this.selectedPerson();
    return this.charts().filter((c) => (c.person_name || 'Unnamed') === p);
  });

  current = computed<SizeChart | null>(() => {
    const list = this.personCharts();
    return list.find((c) => c.id === this.chartId()) ?? list[0] ?? null;
  });

  constructor() {
    this.load();
    // Switching person resets the chosen variation and the delete confirmation.
    effect(() => {
      this.selectedPerson();
      untracked(() => {
        this.chartId.set(null);
        this.confirmDelete.set(false);
      });
    });
  }

  load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
      this.error.set(null);
    }
    const all: SizeChart[] = [];
    const next = (page: number) =>
      this.sizes
        .list({ page, limit: PAGE_SIZE })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ items, meta }) => {
            all.push(...items);
            if (meta.hasMore && page < MAX_PAGES) {
              next(page + 1);
              return;
            }
            this.charts.set(all);
            this.loading.set(false);
          },
          error: (err: Error) => {
            this.error.set(err.message);
            this.loading.set(false);
          },
        });
    next(1);
  }

  // ───────── tabs / chips ─────────

  selectPerson(person: string, focus = false): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { person }, queryParamsHandling: 'merge', replaceUrl: true });
    this.chartId.set(null);
    this.confirmDelete.set(false);
    queueMicrotask(() => {
      const el = this.tabsEl()?.nativeElement.querySelector<HTMLElement>(`[data-person="${CSS.escape(person)}"]`);
      el?.scrollIntoView({ inline: 'center', block: 'nearest' });
      if (focus) el?.focus();
    });
  }

  onTabKey(event: KeyboardEvent): void {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const all = this.people();
    const i = all.indexOf(this.selectedPerson() ?? '');
    let n = -1;
    if (event.key in keys) n = (i + keys[event.key] + all.length) % all.length;
    else if (event.key === 'Home') n = 0;
    else if (event.key === 'End') n = all.length - 1;
    if (n < 0) return;
    event.preventDefault();
    this.selectPerson(all[n], true);
  }

  selectChart(c: SizeChart): void {
    this.chartId.set(c.id);
    this.confirmDelete.set(false);
  }

  // ───────── form ─────────

  openPerson(): void {
    this.editing.set(null);
    this.copyFrom.set(null);
    this.lockPerson.set(false);
    this.defaultPerson.set('');
    this.formOpen.set(true);
  }

  openVariation(): void {
    this.editing.set(null);
    this.copyFrom.set(this.current());
    this.lockPerson.set(true);
    this.defaultPerson.set(this.selectedPerson() ?? '');
    this.formOpen.set(true);
  }

  openEdit(c: SizeChart): void {
    this.editing.set(c);
    this.copyFrom.set(null);
    this.lockPerson.set(true);
    this.formOpen.set(true);
  }

  onSaved(chart: SizeChart): void {
    const exists = this.charts().some((c) => c.id === chart.id);
    this.charts.update((list) => (exists ? list.map((c) => (c.id === chart.id ? chart : c)) : [...list, chart]));
    this.formOpen.set(false);
    this.editing.set(null);
    this.selectPerson(chart.person_name);
    this.chartId.set(chart.id);
  }

  // ───────── delete ─────────

  remove(c: SizeChart): void {
    this.deleting.set(true);
    this.sizes.remove(c.id).subscribe({
      next: ({ message }) => {
        const wasLast = this.personCharts().length === 1;
        this.charts.update((list) => list.filter((x) => x.id !== c.id));
        this.deleting.set(false);
        this.confirmDelete.set(false);
        this.chartId.set(null);
        this.toast.success(message || 'Size deleted.');
        // the person's tab disappears with their last chart: land on the next person
        if (wasLast) {
          const next = this.people()[0];
          this.router.navigate([], { relativeTo: this.route, queryParams: { person: next ?? null }, queryParamsHandling: 'merge', replaceUrl: true });
        }
      },
      error: (err) => {
        this.deleting.set(false);
        this.toast.error(err);
      },
    });
  }
}
