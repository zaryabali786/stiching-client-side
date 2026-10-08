import { Injectable, computed, inject, signal } from '@angular/core';
import { CatalogService } from './catalog.service';
import { ClientPartner, OrderPartner } from '../models/api.models';

const KEY = 'v360-preferred-partner';

/**
 * The stitching partners a customer can choose from, shared by the order form, the order screen and the profile.
 * The customer's last choice is remembered; "recommended" is the partner the platform would pick right now.
 */
@Injectable({ providedIn: 'root' })
export class PartnerChoiceService {
  private catalog = inject(CatalogService);

  readonly partners = signal<ClientPartner[]>([]);
  readonly recommendedId = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private preferredId = signal<string | null>(read());

  /** The partner to start from: the last one the customer used, else the recommended one, else the first. */
  readonly defaultPartner = computed<ClientPartner | null>(() => {
    const list = this.partners();
    return list.find((p) => p.id === this.preferredId()) ?? list.find((p) => p.id === this.recommendedId()) ?? list[0] ?? null;
  });

  load(force = false): void {
    if ((this.loaded() && !force) || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.catalog.partners().subscribe({
      next: ({ items, recommendedId }) => {
        this.partners.set(items);
        this.recommendedId.set(recommendedId);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }

  remember(id: string): void {
    this.preferredId.set(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable: the choice just is not remembered */
    }
  }

  /** The partner of an existing order, shaped like a listed partner (so the same address card can show it). */
  fromOrder(p: OrderPartner | null | undefined): ClientPartner | null {
    if (!p) return null;
    const listed = this.partners().find((x) => x.id === p.id);
    return {
      id: p.id,
      name: p.name,
      short_code: p.short_code,
      city: p.city,
      tagline: listed?.tagline ?? null,
      turnaround_days: listed?.turnaround_days ?? null,
      recommended: false,
      receiving: {
        name: p.receiving_name || listed?.receiving.name || p.name,
        address: p.receiving_address || listed?.receiving.address || '',
        city: p.receiving_city || p.city || listed?.receiving.city || '',
        phone: p.receiving_phone || listed?.receiving.phone || '',
      },
    };
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
