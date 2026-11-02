import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonSpinner } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { ReviewService, ReviewState } from '../../core/services/review.service';
import { ApiError, errorMessage } from '../../core/services/api.service';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const MAX_COMMENT = 2000;

/**
 * Rate a delivered order. It opens from the link in the review email (/review/:token, no sign-in needed: the signed link names the order)
 * and from the customer's own order (/app/orders/:id/review). The server checks who may review what; this page only collects the stars
 * and the comment. An order that already has a review is shown read-only.
 */
@Component({
  selector: 'app-review',
  imports: [RouterLink, IonSpinner, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review.page.html',
  styleUrl: './review.page.scss',
})
export class ReviewPage implements OnInit {
  private route = inject(ActivatedRoute);
  private reviews = inject(ReviewService);
  private auth = inject(AuthService);

  protected readonly maxComment = MAX_COMMENT;
  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly state = signal<ReviewState | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly rating = signal(0);
  protected readonly hover = signal(0);
  protected readonly comment = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  /** The review was saved just now (shows the thank-you). */
  protected readonly justSaved = signal(false);

  private token = '';
  private orderId = '';

  protected readonly signedIn = computed(() => this.auth.isAuthenticated());
  protected readonly shown = computed(() => this.hover() || this.rating());
  protected readonly label = computed(() => LABELS[this.shown()] ?? '');
  protected readonly canSubmit = computed(() => this.rating() >= 1 && !this.submitting() && this.comment().length <= MAX_COMMENT);

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.orderId = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const request = this.token ? this.reviews.byToken(this.token) : this.reviews.forOrder(this.orderId);
    request.subscribe({
      next: (s) => {
        this.state.set(s);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(err instanceof ApiError && err.status === 404 ? 'This review link is not valid, or the order is not yours.' : errorMessage(err));
      },
    });
  }

  protected pick(n: number): void {
    this.rating.set(n);
    this.submitError.set(null);
  }

  /** Arrow keys move the choice like a radio group. */
  protected onKey(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'ArrowRight' || key === 'ArrowUp') this.pick(Math.min(5, (this.rating() || 0) + 1));
    else if (key === 'ArrowLeft' || key === 'ArrowDown') this.pick(Math.max(1, (this.rating() || 2) - 1));
    else return;
    event.preventDefault();
  }

  protected onComment(event: Event): void {
    this.comment.set((event.target as HTMLTextAreaElement).value);
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    const request = this.token
      ? this.reviews.submitByToken(this.token, this.rating(), this.comment())
      : this.reviews.submitForOrder(this.orderId, this.rating(), this.comment());
    request.subscribe({
      next: (saved) => {
        this.submitting.set(false);
        this.justSaved.set(true);
        this.state.update((s) => (s ? { ...s, review: saved.review } : s));
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        if (err instanceof ApiError && err.status === 409) {
          // reviewed meanwhile (another tab or device): show what is saved
          this.load();
          return;
        }
        this.submitError.set(errorMessage(err));
      },
    });
  }
}
