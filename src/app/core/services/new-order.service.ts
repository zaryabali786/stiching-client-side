import { Injectable, signal } from '@angular/core';

/** The "How are you ordering?" popup: opened from anywhere (tab bar, Orders page) without leaving the current page. */
@Injectable({ providedIn: 'root' })
export class NewOrderService {
  readonly isOpen = signal(false);
  /** `ask` = the two options, `website` = our email + address to use at a brand's checkout. */
  readonly view = signal<'ask' | 'website'>('ask');

  open(): void {
    this.view.set('ask');
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
