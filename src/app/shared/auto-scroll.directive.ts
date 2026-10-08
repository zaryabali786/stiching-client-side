import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';

/**
 * Slowly moves a horizontally scrolling row one card at a time (and back to the start at the end).
 * Pauses while the customer is touching / hovering it, and does nothing for people who prefer reduced motion.
 */
@Directive({ selector: '[appAutoScroll]' })
export class AutoScrollDirective implements OnDestroy {
  private el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;

  enabled = input<boolean>(false, { alias: 'appAutoScroll' });

  constructor() {
    const pause = () => (this.paused = true);
    const resume = () => (this.paused = false);
    this.el.addEventListener('pointerdown', pause);
    this.el.addEventListener('pointerenter', pause);
    this.el.addEventListener('pointerup', resume);
    this.el.addEventListener('pointerleave', resume);

    effect(() => {
      this.stop();
      const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (this.enabled() && !reduce) this.timer = setInterval(() => this.next(), 3500);
    });
  }

  private next(): void {
    if (this.paused || this.el.children.length < 2) return;
    const first = this.el.children[0] as HTMLElement;
    const second = this.el.children[1] as HTMLElement;
    const step = second.offsetLeft - first.offsetLeft;
    const atEnd = this.el.scrollLeft + this.el.clientWidth >= this.el.scrollWidth - 4;
    this.el.scrollTo({ left: atEnd ? 0 : this.el.scrollLeft + step, behavior: 'smooth' });
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
