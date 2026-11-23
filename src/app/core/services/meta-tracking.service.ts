import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[][]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: Window['fbq'];
  }
}

/** The standard Meta events used by the ads (the same names on the website and in the phone apps). */
export type MetaEvent = 'CompleteRegistration' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';

interface MetaPayload {
  value?: number;
  currency?: string;
  contentId?: string;
  contentName?: string;
  contentType?: string;
  quantity?: number;
  /** Same id on the website pixel and on the server (Conversions API) so Meta counts one event once. */
  eventId?: string;
}

/**
 * Sends conversion events to Meta Ads.
 * - Website: Meta Pixel (fbq). Loaded once, only when `environment.metaPixelId` is set.
 * - Android / iOS app: the Meta SDK through the Capacitor plugin.
 * Every call is fire-and-forget and never throws: tracking must never break the app.
 */
@Injectable({ providedIn: 'root' })
export class MetaTrackingService {
  private readonly router = inject(Router);
  private readonly native = Capacitor.isNativePlatform();
  private started = false;

  /** Call once at startup. */
  start(): void {
    if (this.started) return;
    this.started = true;
    try {
      if (this.native) void this.startNative();
      else this.startWeb();
    } catch (err) {
      console.warn('Meta tracking could not start', err);
    }
  }

  track(event: MetaEvent, p: MetaPayload = {}): void {
    try {
      if (this.native) void this.trackNative(event, p);
      else this.trackWeb(event, p);
    } catch (err) {
      console.warn('Meta tracking failed', err);
    }
  }

  // ---------------------------------------------------------------- website (Meta Pixel)

  private startWeb(): void {
    const id = environment.metaPixelId;
    if (!id || window.fbq) return;
    // the standard Meta Pixel base code
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else (fbq.queue as unknown[][]).push(args);
    } as NonNullable<Window['fbq']>;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
    fbq('init', id);
    fbq('track', 'PageView');
    // the website is a single page app: every screen change is a new page view
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => window.fbq?.('track', 'PageView'));
  }

  private trackWeb(event: MetaEvent, p: MetaPayload): void {
    if (!window.fbq) return;
    const data: Record<string, unknown> = {};
    if (p.value !== undefined) data['value'] = p.value;
    if (p.currency) data['currency'] = p.currency;
    if (p.contentId) data['content_ids'] = [p.contentId];
    if (p.contentName) data['content_name'] = p.contentName;
    if (p.contentType) data['content_type'] = p.contentType;
    if (p.quantity !== undefined) data['num_items'] = p.quantity;
    window.fbq('track', event, data, p.eventId ? { eventID: p.eventId } : undefined);
  }

  // ---------------------------------------------------------------- Android / iOS (Meta SDK)

  private async startNative(): Promise<void> {
    // dynamic import: the website bundle does not carry the native plugin code
    const { FacebookAnalytics } = await import('@capgo/capacitor-facebook-analytics');
    // iOS 14+: App Tracking Transparency decides whether the advertiser id is shared; the SDK reads that status itself.
    await FacebookAnalytics.initAppEvents();
  }

  private async trackNative(event: MetaEvent, p: MetaPayload): Promise<void> {
    const { FacebookAnalytics, FacebookEventName, FacebookEventParameterName } = await import('@capgo/capacitor-facebook-analytics');
    const names: Record<MetaEvent, string> = {
      CompleteRegistration: FacebookEventName.CompletedRegistration,
      ViewContent: FacebookEventName.ViewedContent,
      AddToCart: FacebookEventName.AddedToCart,
      InitiateCheckout: FacebookEventName.InitiatedCheckout,
      Purchase: FacebookEventName.Purchased,
    };
    const params: Record<string, string> = {};
    if (p.currency) params[FacebookEventParameterName.Currency] = p.currency;
    if (p.contentId) params[FacebookEventParameterName.ContentId] = p.contentId;
    if (p.contentName) params['fb_content_name'] = p.contentName;
    if (p.contentType) params[FacebookEventParameterName.ContentType] = p.contentType;
    if (p.quantity !== undefined) params[FacebookEventParameterName.NumItems] = String(p.quantity);
    if (event === 'Purchase' && p.value !== undefined && p.currency) {
      await FacebookAnalytics.logPurchase({ amount: p.value, currency: p.currency, params });
      return;
    }
    await FacebookAnalytics.logEvent({ event: names[event], valueToSum: p.value, currency: p.currency, params });
  }
}
