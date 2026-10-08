import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';

export type HomeSectionType = 'announcement' | 'marquee' | 'banners' | 'hero' | 'image_text' | 'articles' | 'collection' | 'custom';

/** An article as shown to customers: name and picture only (prices are internal). */
export interface HomeArticle {
  id: string;
  name: string;
  image_url: string | null;
  type_id: string;
  type_name: string;
}

export interface HomeSection {
  id: string;
  type: HomeSectionType;
  /** Settings differ per type; the server cleans them (see backend home-layout.controller.js). */
  settings: Record<string, any>;
  /** Filled in by the server for `articles` and `collection` sections. */
  articles?: HomeArticle[];
}

/** The home page layout the admin built (GET /client/home-layout). */
@Injectable({ providedIn: 'root' })
export class HomeLayoutService {
  private api = inject(ApiService);

  sections(): Observable<HomeSection[]> {
    return this.api.get<{ sections: HomeSection[] }>('/client/home-layout').pipe(map((d) => d.sections));
  }
}
