import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ChatSocketService, OrderUpdateEvent } from './chat-socket.service';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';

const TOAST_GAP_MS = 5000;

/**
 * Live order status changes (`order:update`). Pages subscribe to `updated$` to refresh themselves; when the
 * customer is somewhere else a toast offers to open the order (at most one per 5 seconds, never in the background).
 */
@Injectable({ providedIn: 'root' })
export class OrderEventsService {
  private socket = inject(ChatSocketService);
  private notif = inject(NotificationService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly updated$ = new Subject<OrderUpdateEvent>();
  private lastToast = 0;

  constructor() {
    this.socket.orderUpdate$.subscribe((e) => {
      this.notif.refreshCount();
      this.updated$.next(e);
      this.maybeToast(e);
    });
  }

  private maybeToast(e: OrderUpdateEvent): void {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const path = this.router.url.split(/[?#]/)[0];
    if (path === `/app/orders/${e.orderId}`) return; // the page itself refreshes
    const now = Date.now();
    if (now - this.lastToast < TOAST_GAP_MS) return;
    this.lastToast = now;
    this.toast.withAction(`Your order is now: ${e.status_label}`, 'View', () => void this.router.navigateByUrl(`/app/orders/${e.orderId}`));
  }
}
