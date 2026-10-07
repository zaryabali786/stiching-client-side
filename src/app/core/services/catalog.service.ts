import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Article, ArticleType, ApiResult, Brand, Courier, Paged, ProductPreview } from '../models/api.models';

export const CATALOG_PAGE_SIZE = 20;

/** Order form lookups (/client/brands, /couriers, /article-types, /articles). Always searched and paged on the server. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private api = inject(ApiService);

  brands(page: number, search: string): Observable<Paged<Brand>> {
    return this.api.getPage<Brand>('/client/brands', { page, limit: CATALOG_PAGE_SIZE, search: search.trim() });
  }

  /** Adds a brand (or returns the existing one with the same name). */
  createBrand(name: string): Observable<ApiResult<Brand>> {
    return this.api.post<Brand>('/client/brands', { name: name.trim() });
  }

  couriers(page: number, search: string): Observable<Paged<Courier>> {
    return this.api.getPage<Courier>('/client/couriers', { page, limit: CATALOG_PAGE_SIZE, search: search.trim() });
  }

  articleTypes(page: number, limit = CATALOG_PAGE_SIZE): Observable<Paged<ArticleType>> {
    return this.api.getPage<ArticleType>('/client/article-types', { page, limit });
  }

  articles(typeId: string, page: number, search: string): Observable<Paged<Article>> {
    return this.api.getPage<Article>('/client/articles', {
      type_id: typeId,
      page,
      limit: CATALOG_PAGE_SIZE,
      search: search.trim(),
    });
  }

  /** Reads a product page (title + image, never a price). */
  previewProduct(url: string): Observable<ApiResult<ProductPreview>> {
    return this.api.post<ProductPreview>('/client/products/preview', { url: url.trim() });
  }
}
