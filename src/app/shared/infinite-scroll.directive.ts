import { Directive, ElementRef, OnDestroy, OnInit, inject, input, output } from '@angular/core';

/**
 * Emits `reached` when the host element (a sentinel at the end of a list) scrolls into view.
 * Render the sentinel only while more pages exist and nothing is loading; every time it is
 * re-created the observer fires again if it is still visible.
 */
@Directive({ selector: '[appInfiniteScroll]' })
export class InfiniteScrollDirective implements OnInit, OnDestroy {
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly rootMargin = input('240px');
  readonly reached = output<void>();
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) this.reached.emit();
      },
      { rootMargin: this.rootMargin() },
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
