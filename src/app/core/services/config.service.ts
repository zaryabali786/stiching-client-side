import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { PlatformConfig } from '../models/api.models';

/** Public platform config (GET /config) — our receiving address. Loaded once and cached. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private api = inject(ApiService);

  readonly config = signal<PlatformConfig | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly brandName = computed(() => this.config()?.name || '');

  load(force = false): void {
    if ((this.config() && !force) || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.get<PlatformConfig>('/config').subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }
}
