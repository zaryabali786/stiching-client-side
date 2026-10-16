import { Injectable } from '@angular/core';

/**
 * Countries, states and cities for the address pickers, from the free CountriesNow API (https://countriesnow.space).
 *
 *   countries()            every country name
 *   states(country)        the states / provinces of a country (empty for a country without any)
 *   cities(country, state) the cities of a state, or of the whole country when no state is given
 *
 * The API is public and sends no credentials, so these calls use `fetch` directly (the app's HTTP interceptors would add the
 * signed-in user's token to a request meant for another site). Answers are kept in memory and in localStorage (30 days), so a list is
 * downloaded once. Every call rejects when the API cannot be reached: the picker then lets the person type the value instead.
 */
const BASE = 'https://countriesnow.space/api/v0.1';
const CACHE_PREFIX = 'v360_geo_v1:';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 20_000;

/** The countries customers use most, listed first in the country dropdown. */
export const POPULAR_COUNTRIES = ['Pakistan', 'United Kingdom', 'United States', 'Canada', 'United Arab Emirates', 'Saudi Arabia', 'Australia'];

@Injectable({ providedIn: 'root' })
export class GeoService {
  private memory = new Map<string, string[]>();
  private inflight = new Map<string, Promise<string[]>>();

  countries(): Promise<string[]> {
    return this.cached('countries', async () => {
      const json = await this.get('/countries/iso');
      const list = (json?.data as { name?: string }[] | undefined) ?? [];
      return this.sorted(list.map((c) => c.name ?? ''));
    });
  }

  states(country: string): Promise<string[]> {
    return this.cached(`states:${country}`, async () => {
      const json = await this.get(`/countries/states/q?country=${encodeURIComponent(country)}`);
      const list = (json?.data?.states as { name?: string }[] | undefined) ?? [];
      return this.sorted(list.map((s) => s.name ?? ''));
    });
  }

  cities(country: string, state?: string | null): Promise<string[]> {
    const key = state ? `cities:${country}:${state}` : `cities:${country}`;
    return this.cached(key, async () => {
      const url = state
        ? `/countries/state/cities/q?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}`
        : `/countries/cities/q?country=${encodeURIComponent(country)}`;
      const json = await this.get(url);
      const list = (json?.data as string[] | undefined) ?? [];
      return this.sorted(list);
    });
  }

  private sorted(values: string[]): string[] {
    return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  /** Memory, then localStorage, then the network. One request per list even when several pickers ask at once. */
  private cached(key: string, load: () => Promise<string[]>): Promise<string[]> {
    const hit = this.memory.get(key) ?? this.fromStorage(key);
    if (hit) {
      this.memory.set(key, hit);
      return Promise.resolve(hit);
    }
    const running = this.inflight.get(key);
    if (running) return running;
    const p = load()
      .then((list) => {
        this.memory.set(key, list);
        this.toStorage(key, list);
        return list;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async get(path: string): Promise<{ error?: boolean; msg?: string; data?: any }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(BASE + path, { signal: ctrl.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
      if (!res.ok) throw new Error(`The address list is not available right now (${res.status}).`);
      const json = await res.json();
      // the API answers 200 with error: true for something it does not know, e.g. a country without states
      if (json?.error) return { error: true, msg: json.msg, data: path.includes('/states/') ? { states: [] } : [] };
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  private fromStorage(key: string): string[] | null {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { t: number; v: string[] };
      return Date.now() - parsed.t < TTL_MS && Array.isArray(parsed.v) ? parsed.v : null;
    } catch {
      return null;
    }
  }

  private toStorage(key: string, list: string[]): void {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: list }));
    } catch {
      /* storage full or blocked: the memory copy still works */
    }
  }
}
