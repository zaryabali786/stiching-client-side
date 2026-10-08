import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { BannerService, HomeBanner } from '../core/services/banner.service';

/** The admin's banners (Setup > Home banners): one banner stays put, several become an auto-sliding carousel. */
@Component({
  selector: 'app-home-banners',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <span class="skeleton banner-skeleton" aria-busy="true" aria-label="Loading banners"></span>
    } @else if (banners().length) {
      <section class="banner-carousel" [class.single]="banners().length === 1" aria-label="Offers and announcements">
        <div #track class="banner-track" (scroll)="onScroll()" (pointerdown)="paused = true" (pointerup)="paused = false" (pointerleave)="paused = false">
          @for (b of banners(); track b.id) {
            @if (b.link_url && isAppLink(b.link_url)) {
              <a class="banner-slide" [href]="b.link_url" (click)="openApp($event, b.link_url)">
                <img [src]="b.image_url" [alt]="b.title || 'Banner'" loading="lazy" />
              </a>
            } @else if (b.link_url) {
              <a class="banner-slide" [href]="b.link_url" target="_blank" rel="noopener noreferrer">
                <img [src]="b.image_url" [alt]="b.title || 'Banner'" loading="lazy" />
              </a>
            } @else {
              <div class="banner-slide">
                <img [src]="b.image_url" [alt]="b.title || 'Banner'" loading="lazy" />
              </div>
            }
          }
        </div>
        @if (banners().length > 1) {
          <div class="banner-dots" role="tablist" aria-label="Choose banner">
            @for (b of banners(); track b.id; let i = $index) {
              <button type="button" class="dot" role="tab" [class.on]="i === index()" [attr.aria-selected]="i === index()" [attr.aria-label]="'Banner ' + (i + 1)" (click)="goTo(i)"></button>
            }
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .banner-skeleton { display: block; width: 100%; aspect-ratio: 12 / 5; border-radius: var(--radius-card, 16px); }
    .banner-track { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: var(--radius-card, 16px); }
    .banner-track::-webkit-scrollbar { display: none; }
    .banner-slide { flex: 0 0 100%; scroll-snap-align: center; display: block; border-radius: var(--radius-card, 16px); overflow: hidden; background: #e2e8f0; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06); }
    .banner-slide img { display: block; width: 100%; aspect-ratio: 12 / 5; object-fit: cover; }
    .single .banner-track { overflow: hidden; }
    .banner-dots { display: flex; justify-content: center; gap: 6px; margin-top: 10px; }
    .dot { width: 7px; height: 7px; padding: 0; border: 0; border-radius: 999px; background: #cbd5e1; transition: width 0.2s ease, background 0.2s ease; cursor: pointer; }
    .dot.on { width: 20px; background: var(--c-brand, #0f172a); }
  `,
})
export class HomeBannersComponent {
  private api = inject(BannerService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private track = viewChild<ElementRef<HTMLElement>>('track');
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Turn off the automatic sliding (the admin can switch it off per section). */
  autoplay = input(true);

  banners = signal<HomeBanner[]>([]);
  loading = signal(true);
  index = signal(0);
  paused = false;

  constructor() {
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.banners.set(rows);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });

    effect(() => {
      this.stop();
      if (this.autoplay() && this.banners().length > 1) {
        this.timer = setInterval(() => {
          if (!this.paused) this.goTo((this.index() + 1) % this.banners().length);
        }, 4500);
      }
    });
    this.destroyRef.onDestroy(() => this.stop());
  }

  isAppLink(link: string): boolean {
    return link.startsWith('/app/');
  }

  openApp(event: Event, link: string): void {
    event.preventDefault();
    void this.router.navigateByUrl(link);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  goTo(i: number): void {
    const track = this.track()?.nativeElement;
    const slide = track?.children[i] as HTMLElement | undefined;
    if (!track || !slide) return;
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft - (track.clientWidth - slide.clientWidth) / 2, behavior: 'smooth' });
    this.index.set(i);
  }

  onScroll(): void {
    const track = this.track()?.nativeElement;
    if (!track || track.children.length < 2) return;
    const step = (track.children[1] as HTMLElement).offsetLeft - (track.children[0] as HTMLElement).offsetLeft;
    const i = Math.max(0, Math.min(track.children.length - 1, Math.round(track.scrollLeft / (step || 1))));
    if (i !== this.index()) this.index.set(i);
  }
}
