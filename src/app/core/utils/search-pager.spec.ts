import { Subject, of, throwError } from 'rxjs';
import { Paged } from '../models/api.models';
import { SearchPager } from './search-pager';

interface Row {
  id: string;
}

const page = (ids: string[], p: number, hasMore: boolean): Paged<Row> => ({
  items: ids.map((id) => ({ id })),
  meta: { page: p, limit: 2, total: 99, totalPages: hasMore ? p + 1 : p, hasMore },
});

describe('SearchPager', () => {
  it('loads page 1, then appends later pages without duplicates', () => {
    const pager = new SearchPager<Row>(() => (p) => of(p === 1 ? page(['a', 'b'], 1, true) : page(['b', 'c'], 2, false)));
    pager.reset('');
    expect(pager.items().map((i) => i.id)).toEqual(['a', 'b']);
    expect(pager.hasMore()).toBe(true);
    pager.loadMore();
    expect(pager.items().map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(pager.hasMore()).toBe(false);
    pager.loadMore(); // nothing more: no extra request
    expect(pager.items().length).toBe(3);
  });

  it('ignores a slow earlier search that finishes after a newer one', () => {
    const calls = new Map<string, Subject<Paged<Row>>>();
    const pager = new SearchPager<Row>(() => (_p, search) => {
      const s = new Subject<Paged<Row>>();
      calls.set(search, s);
      return s;
    });
    pager.reset('sa');
    pager.reset('sap');
    // the old request was cancelled, so its late answer is dropped
    calls.get('sa')!.next(page(['old'], 1, false));
    calls.get('sap')!.next(page(['new'], 1, false));
    expect(pager.items().map((i) => i.id)).toEqual(['new']);
    expect(pager.appliedSearch()).toBe('sap');
  });

  it('cancels a pending load-more when the search changes', () => {
    const calls: { search: string; page: number; s: Subject<Paged<Row>> }[] = [];
    const pager = new SearchPager<Row>(() => (p, search) => {
      const s = new Subject<Paged<Row>>();
      calls.push({ search, page: p, s });
      return s;
    });
    pager.reset('');
    calls[0].s.next(page(['a'], 1, true));
    pager.loadMore();
    pager.reset('x');
    calls[1].s.next(page(['stale'], 2, false)); // answer to the cancelled load-more
    calls[2].s.next(page(['x1'], 1, false));
    expect(pager.items().map((i) => i.id)).toEqual(['x1']);
  });

  it('reports a first-page error and retries it', () => {
    let fail = true;
    const pager = new SearchPager<Row>(() => () => (fail ? throwError(() => new Error('Offline')) : of(page(['a'], 1, false))));
    pager.reset('');
    expect(pager.error()).toBe('Offline');
    expect(pager.loading()).toBe(false);
    fail = false;
    pager.retry();
    expect(pager.error()).toBeNull();
    expect(pager.items().length).toBe(1);
  });

  it('keeps loaded items when a later page fails', () => {
    let n = 0;
    const pager = new SearchPager<Row>(() => (p) => (++n === 2 ? throwError(() => new Error('Slow')) : of(page(['a'], p, true))));
    pager.reset('');
    pager.loadMore();
    expect(pager.moreError()).toBe('Slow');
    expect(pager.items().length).toBe(1);
  });
});
