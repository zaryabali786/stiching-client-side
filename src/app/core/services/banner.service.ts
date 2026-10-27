import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

/** A home-page banner set up by the admin. `link_url` is opened when the customer taps it. */
export interface HomeBanner {
  id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
  /** Text printed on the banner, and the button under it (where it goes is `button_link`). */
  heading: string | null;
  subheading: string | null;
  button_label: string | null;
  button_link: string | null;
  text_color: string;
  button_bg: string;
  button_color: string;
  /** How dark the layer behind the text is, 0 to 80. */
  overlay: number;
  text_align: 'left' | 'center';
  /** The part of the picture that stays in view when it is cropped (percent across and down). */
  focus_x: number;
  focus_y: number;
}

/** Active home-page banners (/client/banners). */
@Injectable({ providedIn: 'root' })
export class BannerService {
  private api = inject(ApiService);

  list(): Observable<HomeBanner[]> {
    return this.api.get<HomeBanner[]>('/client/banners');
  }
}
