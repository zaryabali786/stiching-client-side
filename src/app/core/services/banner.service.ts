import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

/** A home-page banner set up by the admin. `link_url` is opened when the customer taps it. */
export interface HomeBanner {
  id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
}

/** Active home-page banners (/client/banners). */
@Injectable({ providedIn: 'root' })
export class BannerService {
  private api = inject(ApiService);

  list(): Observable<HomeBanner[]> {
    return this.api.get<HomeBanner[]>('/client/banners');
  }
}
