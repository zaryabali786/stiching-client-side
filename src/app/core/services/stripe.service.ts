import { Injectable } from '@angular/core';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';

/**
 * Loads Stripe.js on demand (only when someone opens the payment sheet, never at app start) and caches it.
 * Works the same in the browser and inside the Capacitor native shell, which is a web view.
 * Only the PUBLISHABLE key is used here; the secret key lives on the server.
 */
@Injectable({ providedIn: 'root' })
export class StripeService {
  private cache = new Map<string, Promise<Stripe | null>>();

  load(publishableKey: string): Promise<Stripe | null> {
    let loaded = this.cache.get(publishableKey);
    if (!loaded) {
      loaded = loadStripe(publishableKey).catch(() => {
        // a failed network load must be retryable
        this.cache.delete(publishableKey);
        return null;
      });
      this.cache.set(publishableKey, loaded);
    }
    return loaded;
  }
}
