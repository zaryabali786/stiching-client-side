import { Injectable, signal } from '@angular/core';
import { errorMessage } from './api.service';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Optional button (e.g. "View"). */
  action?: { label: string; run: () => void };
}

/** Minimal app-wide toast queue rendered by <app-toast-host> (in AppComponent). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  success(message: string, duration = 2800): void {
    this.show('success', message, duration);
  }

  info(message: string, duration = 2800): void {
    this.show('info', message, duration);
  }

  /** Accepts an Error/ApiError/string and shows the API message. */
  error(err: unknown, fallback?: string, duration = 4200): void {
    this.show('error', errorMessage(err, fallback), duration);
  }

  /** Info toast with an action button; stays a little longer. */
  withAction(message: string, label: string, run: () => void, duration = 6500): void {
    this.show('info', message, duration, { label, run });
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(tone: ToastTone, message: string, duration: number, action?: Toast['action']): void {
    if (!message) return;
    const id = ++this.seq;
    // keep at most 3 on screen
    this.toasts.update((list) => [...list.slice(-2), { id, tone, message, action }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}
