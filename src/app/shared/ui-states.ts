import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/** Shimmer placeholders while a list / card / detail page loads. */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-busy': 'true', 'aria-label': 'Loading' },
  template: `
    @switch (variant()) {
      @case ('tiles') {
        <div class="sk-stack">
          @for (i of rows(); track i) {
            <div class="sk-tile">
              <span class="skeleton sk-avatar"></span>
              <div class="sk-lines">
                <span class="skeleton" style="width: 62%; height: 13px"></span>
                <span class="skeleton" style="width: 40%; height: 10px"></span>
              </div>
              <span class="skeleton" style="width: 64px; height: 20px; border-radius: 999px"></span>
            </div>
          }
        </div>
      }
      @case ('metrics') {
        <div class="sk-grid">
          @for (i of rows(); track i) {
            <div class="sk-metric">
              <span class="skeleton" style="width: 55%; height: 10px"></span>
              <span class="skeleton" style="width: 40%; height: 26px"></span>
            </div>
          }
        </div>
      }
      @default {
        <div class="sk-stack">
          @for (i of rows(); track i) {
            <div class="sk-card">
              <span class="skeleton" style="width: 35%; height: 10px"></span>
              <span class="skeleton" style="width: 75%; height: 18px"></span>
              <span class="skeleton" style="width: 90%; height: 11px"></span>
              <span class="skeleton" style="width: 60%; height: 11px"></span>
            </div>
          }
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .sk-stack { display: flex; flex-direction: column; gap: 10px; }
    .sk-tile, .sk-card, .sk-metric {
      background: var(--c-surface); border: 1px solid var(--c-line); border-radius: 16px; padding: 14px;
    }
    .sk-tile { display: flex; align-items: center; gap: 12px; }
    .sk-avatar { width: 42px; height: 42px; border-radius: 12px; flex: none; }
    .sk-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .sk-card { display: flex; flex-direction: column; gap: 10px; }
    .sk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .sk-metric { display: flex; flex-direction: column; gap: 10px; }
  `,
})
export class SkeletonComponent {
  readonly variant = input<'tiles' | 'cards' | 'metrics'>('tiles');
  readonly count = input(3);
  protected rows = () => Array.from({ length: this.count() }, (_, i) => i);
}

/** Friendly empty state with optional projected action buttons. */
@Component({
  selector: 'app-empty-state',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      <span class="state-icon" aria-hidden="true"><ion-icon [name]="icon()"></ion-icon></span>
      <h3 class="state-title">{{ title() }}</h3>
      @if (message()) {
        <p class="state-text">{{ message() }}</p>
      }
      <div class="state-actions"><ng-content /></div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input('sparkles-outline');
  readonly title = input.required<string>();
  readonly message = input<string>('');
}

/** Error state with a retry button. */
@Component({
  selector: 'app-error-state',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-state" role="alert">
      <span class="state-icon" aria-hidden="true"><ion-icon name="cloud-offline-outline"></ion-icon></span>
      <h3 class="state-title">{{ title() }}</h3>
      <p class="state-text">{{ message() }}</p>
      <div class="state-actions">
        <button type="button" class="btn btn-outline btn-sm" (click)="retry.emit()">
          <ion-icon name="refresh-outline" aria-hidden="true"></ion-icon> Try again
        </button>
      </div>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly title = input("We couldn't load this");
  readonly message = input('Something went wrong.');
  readonly retry = output<void>();
}
