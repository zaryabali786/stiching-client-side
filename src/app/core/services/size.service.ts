import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResult, Paged, SizeChart, SizeChartInput } from '../models/api.models';

/** Customer size charts (/client/sizes). */
@Injectable({ providedIn: 'root' })
export class SizeService {
  private api = inject(ApiService);

  list(params: { page?: number; limit?: number; search?: string } = {}): Observable<Paged<SizeChart>> {
    return this.api.getPage<SizeChart>('/client/sizes', {
      page: params.page ?? 1,
      limit: params.limit ?? 100,
      search: params.search,
    }).pipe(map((page) => ({ ...page, items: page.items.map(normalize) })));
  }

  create(body: SizeChartInput): Observable<ApiResult<SizeChart>> {
    return this.api.post<SizeChart>('/client/sizes', body).pipe(map((r) => ({ ...r, data: normalize(r.data) })));
  }

  update(id: string, body: SizeChartInput): Observable<ApiResult<SizeChart>> {
    return this.api
      .patch<SizeChart>(`/client/sizes/${encodeURIComponent(id)}`, body)
      .pipe(map((r) => ({ ...r, data: normalize(r.data) })));
  }

  remove(id: string): Observable<ApiResult<null>> {
    return this.api.delete(`/client/sizes/${encodeURIComponent(id)}`);
  }
}

/** Guard against null JSON columns from older rows. */
function normalize(c: SizeChart): SizeChart {
  return { ...c, measurements: c.measurements ?? {} };
}
