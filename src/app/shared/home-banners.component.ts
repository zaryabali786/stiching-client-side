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
            <div class="banner-slide" [class.has-copy]="hasCopy(b)" [class.center]="b.text_align === 'center'" [style.--ov]="b.overlay / 100" [style.--tc]="b.text_color">
              <img [src]="b.image_url" [alt]="b.title || b.heading || 'Banner'" [style.object-position]="b.focus_x + '% ' + b.focus_y + '%'" loading="lazy" />
              @if (b.link_url) {
                <a class="slide-hit" [href]="b.link_url" [attr.target]="isAppLink(b.link_url) ? null : '_blank'" rel="noopener noreferrer" [attr.aria-label]="b.title || b.heading || 'Open banner'" (click)="isAppLink(b.link_url) && openApp($event, b.link_url)"></a>
              }
              @if (hasCopy(b)) {
                <div class="slide-copy">
                  @if (b.heading) { <strong class="slide-title">{{ b.heading }}</strong> }
                  @if (b.subheading) { <span class="slide-sub">{{ b.subheading }}</span> }
                  @if (b.button_label) {
                    @if (b.button_link) {
                      <a class="slide-btn" [style.background]="b.button_bg" [style.color]="b.button_color" [href]="b.button_link" [attr.target]="isAppLink(b.button_link) ? null : '_blank'" rel="noopener noreferrer" (click)="isAppLink(b.button_link) && openApp($event, b.button_link)">{{ b.button_label }}</a>
                    } @else {
                      <span class="slide-btn" [style.background]="b.button_bg" [style.color]="b.button_color">{{ b.button_label }}</span>
                    }
                  }
                </div>
              }
            </div>
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
    .banner-slide { container-type: inline-size; position: relative; flex: 0 0 100%; scroll-snap-align: center; display: block; border-radius: var(--radius-card, 16px); overflow: hidden; background: #e2e8f0; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06); }
    .banner-slide img { display: block; width: 100%; aspect-ratio: 12 / 5; object-fit: cover; }
    .slide-hit { position: absolute; inset: 0; z-index: 1; }
    /* text on the banner: a dark layer (how dark is the admin's choice) so it can be read, then the heading, the small text and the button. Sizes follow the banner's own width. */
    .has-copy::before { content: ''; position: absolute; inset: 0; z-index: 0; background: linear-gradient(90deg, rgba(0, 0, 0, var(--ov, 0.35)) 0%, rgba(0, 0, 0, calc(var(--ov, 0.35) * 0.55)) 55%, rgba(0, 0, 0, 0) 100%); pointer-events: none; }
    .has-copy.center::before { background: rgba(0, 0, 0, var(--ov, 0.35)); }
    .slide-copy { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 1.6cqw; padding: 4cqw 6cqw; color: var(--tc, #fff); pointer-events: none; }
    .center .slide-copy { align-items: center; text-align: center; }
    .slide-title { max-width: 66cqw; font-family: var(--font-sans); font-size: 7.1cqw; line-height: 1.1; font-weight: 700; letter-spacing: -0.01em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .center .slide-title { max-width: 84cqw; }
    .slide-sub { max-width: 66cqw; font-size: 3.1cqw; line-height: 1.3; opacity: 0.92; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .center .slide-sub { max-width: 84cqw; }
    .slide-btn { margin-top: 1.4cqw; padding: 2.3cqw 5cqw; border-radius: 2.2cqw; font-size: 3.5cqw; line-height: 1.1; font-weight: 600; text-decoration: none; white-space: nowrap; pointer-events: auto; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18); }
    span.slide-btn { pointer-events: none; }
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

  /** Anything printed on the banner (the dark layer and the text are only added then). */
  hasCopy(b: HomeBanner): boolean {
    return !!(b.heading || b.subheading || b.button_label);
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
