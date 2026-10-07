import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/** One chat shown in the app-wide chat sheet: an order's General chat, or one article's chat. */
export interface ChatTarget {
  orderId: string;
  /** Shown above the title. */
  reference: string;
  /** `general` or an article id. */
  unitId: string;
  title: string;
  /** Opened from the "your chats" list (the sheet then offers a way back to it). */
  fromList: boolean;
}

/**
 * State of the chat that lives in the app shell (floating button + bottom sheet), so every page can open it.
 * The order page tells it which order is on screen; elsewhere the button opens the list of chats.
 */
@Injectable({ providedIn: 'root' })
export class ChatUiService {
  /** The order whose page is on screen: the floating button opens its General chat. */
  readonly pageOrder = signal<{ id: string; reference: string } | null>(null);
  readonly listOpen = signal(false);
  readonly target = signal<ChatTarget | null>(null);
  /** A chat was marked read (order id): pages refresh their unread badges. */
  readonly read$ = new Subject<string>();

  openChat(t: Omit<ChatTarget, 'fromList'>, fromList = false): void {
    this.target.set({ ...t, fromList });
    this.listOpen.set(false);
  }

  openList(): void {
    this.target.set(null);
    this.listOpen.set(true);
  }

  close(): void {
    this.target.set(null);
    this.listOpen.set(false);
  }
}
