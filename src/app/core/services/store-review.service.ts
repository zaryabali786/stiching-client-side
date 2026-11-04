import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

const KEY = 'store_review_asks';
/** Not again within this many days, and never more than MAX_ASKS times: the stores limit it too, this keeps us well inside their limits. */
const MIN_DAYS_BETWEEN = 120;
const MAX_ASKS = 3;

/**
 * Asks the customer for a rating in the Play Store / App Store, in a popup inside the app (Google In-App Review, Apple's rating box).
 * Rules of the stores this follows:
 *   - It is called by the app at a good moment, never from a "Rate us" button: the store decides whether the popup shows at all (it keeps a
 *     quota per person), and the app is never told if it showed or what was chosen.
 *   - Only after a happy moment: here, when the customer has just given 4 or 5 stars in our own review. Unhappy customers are not
 *     steered away, they simply are not asked; nothing is offered in return for a rating.
 *   - It only appears in an app installed from the store (not in a debug build or the browser), so the call is silent elsewhere.
 */
@Injectable({ providedIn: 'root' })
export class StoreReviewService {
  /** Ask once, if the phone app is running, the person has not been asked recently, and the rating they just gave was good. */
  async askAfterGoodRating(rating: number): Promise<void> {
    if (rating < 4 || !Capacitor.isNativePlatform() || !this.mayAsk()) return;
    try {
      const { InAppReview } = await import('@capacitor-community/in-app-review');
      this.remember();
      await InAppReview.requestReview();
    } catch (err) {
      console.warn('[StoreReview] not shown:', err);
    }
  }

  private read(): number[] {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list.filter((n) => typeof n === 'number') : [];
    } catch {
      return [];
    }
  }

  private mayAsk(): boolean {
    const asks = this.read();
    if (asks.length >= MAX_ASKS) return false;
    const last = asks.length ? Math.max(...asks) : 0;
    return Date.now() - last >= MIN_DAYS_BETWEEN * 24 * 60 * 60 * 1000;
  }

  private remember(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.read(), Date.now()]));
    } catch {
      /* storage unavailable: the store's own quota still applies */
    }
  }
}
