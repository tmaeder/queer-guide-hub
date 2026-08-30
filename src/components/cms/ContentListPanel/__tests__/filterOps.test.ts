import { describe, it, expect } from 'vitest';
import {
  applyFilter,
  applyFilters,
  applySorts,
  applyArchivedView,
  type QueryBuilderLike,
} from '../filterOps';
import type { Filter } from '../viewSpec';

/**
 * Records every builder call instead of hitting the network, so the exact
 * PostgREST translation is asserted rather than assumed.
 */
type Call = [string, ...unknown[]];

interface Stub extends QueryBuilderLike<Stub> {
  calls: Call[];
}

function stub(): { q: Stub; calls: Call[] } {
  const calls: Call[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]): Stub => {
      calls.push([name, ...args]);
      return q;
    };
  const q: Stub = {
    calls,
    eq: rec('eq'),
    neq: rec('neq'),
    gt: rec('gt'),
    gte: rec('gte'),
    lt: rec('lt'),
    lte: rec('lte'),
    ilike: rec('ilike'),
    not: rec('not'),
    is: rec('is'),
    in: rec('in'),
    contains: rec('contains'),
    overlaps: rec('overlaps'),
    or: rec('or'),
    // Flattened so assertions read ['order', col, ascending].
    order: (c: string, o: { ascending: boolean }) => {
      calls.push(['order', c, o.ascending]);
      return q;
    },
  };
  return { q, calls };
}

const filter = (over: Partial<Filter> & Pick<Filter, 'field' | 'op'>): Filter => ({
  id: 'x',
  ...over,
});

describe('presence operators', () => {
  it('is_empty and is_not_empty carry no value', () => {
    const a = stub();
    applyFilter(a.q, filter({ field: 'city', op: 'is_empty' }));
    expect(a.calls).toEqual([['is', 'city', null]]);

    const b = stub();
    applyFilter(b.q, filter({ field: 'city', op: 'is_not_empty' }));
    expect(b.calls).toEqual([['not', 'city', 'is', null]]);
  });

  it('booleans map to eq true/false', () => {
    const t = stub();
    applyFilter(t.q, filter({ field: 'verified', op: 'is_true' }));
    expect(t.calls).toEqual([['eq', 'verified', true]]);
  });
});

describe('text operators', () => {
  it('contains wraps in wildcards', () => {
    const s = stub();
    applyFilter(s.q, filter({ field: 'name', op: 'contains', value: 'berg' }));
    expect(s.calls).toEqual([['ilike', 'name', '%berg%']]);
  });

  it('starts_with anchors the left side', () => {
    const s = stub();
    applyFilter(s.q, filter({ field: 'name', op: 'starts_with', value: 'Ber' }));
    expect(s.calls).toEqual([['ilike', 'name', 'Ber%']]);
  });

  it('escapes LIKE wildcards the user typed literally', () => {
    // Searching for "50%" must not become "match anything".
    const s = stub();
    applyFilter(s.q, filter({ field: 'name', op: 'contains', value: '50% _off' }));
    expect(s.calls).toEqual([['ilike', 'name', '%50\\% \\_off%']]);
  });
});

describe('set operators', () => {
  it('in passes the list through', () => {
    const s = stub();
    applyFilter(s.q, filter({ field: 'category', op: 'in', value: ['bar', 'club'] }));
    expect(s.calls).toEqual([['in', 'category', ['bar', 'club']]]);
  });

  it('an empty selection is a no-op, not "match nothing"', () => {
    // Opening the picker and choosing nothing yet must not blank the list.
    const s = stub();
    applyFilter(s.q, filter({ field: 'category', op: 'in', value: [] }));
    expect(s.calls).toEqual([]);
  });

  it('has_all is containment and has_any is overlap', () => {
    const all = stub();
    applyFilter(all.q, filter({ field: 'amenities', op: 'has_all', value: ['wifi', 'bar'] }));
    expect(all.calls).toEqual([['contains', 'amenities', ['wifi', 'bar']]]);

    const any = stub();
    applyFilter(any.q, filter({ field: 'amenities', op: 'has_any', value: ['wifi', 'bar'] }));
    expect(any.calls).toEqual([['overlaps', 'amenities', ['wifi', 'bar']]]);
  });

  it('drops blank entries from a list', () => {
    const s = stub();
    applyFilter(s.q, filter({ field: 'category', op: 'in', value: ['bar', '', null] }));
    expect(s.calls).toEqual([['in', 'category', ['bar']]]);
  });
});

describe('range operators', () => {
  it('between accepts from/to and min/max', () => {
    const d = stub();
    applyFilter(d.q, filter({ field: 'starts_at', op: 'between', value: { from: 'a', to: 'b' } }));
    expect(d.calls).toEqual([
      ['gte', 'starts_at', 'a'],
      ['lte', 'starts_at', 'b'],
    ]);

    const n = stub();
    applyFilter(n.q, filter({ field: 'price', op: 'between', value: { min: 1, max: 4 } }));
    expect(n.calls).toEqual([
      ['gte', 'price', 1],
      ['lte', 'price', 4],
    ]);
  });

  it('applies a one-sided range', () => {
    const s = stub();
    applyFilter(s.q, filter({ field: 'price', op: 'between', value: { min: 2 } }));
    expect(s.calls).toEqual([['gte', 'price', 2]]);
  });

  it('treats 0 as a real bound, not as blank', () => {
    const s = stub();
    applyFilter(s.q, filter({ field: 'price', op: 'between', value: { min: 0, max: 0 } }));
    expect(s.calls).toEqual([
      ['gte', 'price', 0],
      ['lte', 'price', 0],
    ]);
  });

  it('maps before/after onto lte/gte', () => {
    const s = stub();
    applyFilters(s.q, [
      filter({ field: 'd', op: 'after', value: '2026-01-01' }),
      filter({ field: 'd', op: 'before', value: '2026-02-01' }),
    ]);
    expect(s.calls).toEqual([
      ['gte', 'd', '2026-01-01'],
      ['lte', 'd', '2026-02-01'],
    ]);
  });
});

describe('half-typed rows', () => {
  it('a filter with no value yet does not touch the query', () => {
    const s = stub();
    applyFilters(s.q, [
      filter({ field: 'name', op: 'contains', value: '' }),
      filter({ field: 'name', op: 'eq' }),
    ]);
    expect(s.calls).toEqual([]);
  });

  it('but false is a real value', () => {
    const s = stub();
    applyFilter(s.q, filter({ field: 'verified', op: 'eq', value: false }));
    expect(s.calls).toEqual([['eq', 'verified', false]]);
  });
});

describe('applySorts', () => {
  it('preserves precedence and resolves the column name', () => {
    const s = stub();
    applySorts(
      s.q,
      [
        { field: 'title', dir: 'asc' },
        { field: 'updated_at', dir: 'desc' },
      ],
      (f) => (f === 'title' ? 'name' : f),
    );
    expect(s.calls).toEqual([
      ['order', 'name', true],
      ['order', 'updated_at', false],
    ]);
  });
});

describe('applyArchivedView', () => {
  const PRESENT = { column: 'archived_at', predicate: 'present' as const, label: 'Archived' };
  const EQUALS = { column: 'review_status', value: 'archived', label: 'Archived' };

  it('present: live is a NULL check, archived is its inverse', () => {
    const a = stub();
    applyArchivedView(a.q, PRESENT, 'live');
    expect(a.calls).toEqual([['is', 'archived_at', null]]);

    const b = stub();
    applyArchivedView(b.q, PRESENT, 'archived');
    expect(b.calls).toEqual([['not', 'archived_at', 'is', null]]);
  });

  it('equals: archived is a plain eq', () => {
    const { q, calls } = stub();
    applyArchivedView(q, EQUALS, 'archived');
    expect(calls).toEqual([['eq', 'review_status', 'archived']]);
  });

  it('equals: LIVE is NULL-safe, never a bare neq', () => {
    // `review_status <> 'archived'` is NULL for a NULL status, so PostgREST
    // drops those rows. A bare .neq() would hide every row whose status has
    // never been set — the list reads as empty rather than as wrong, which is
    // the expensive direction. Same defect usePageFetchers already fixed.
    const { q, calls } = stub();
    applyArchivedView(q, EQUALS, 'live');
    expect(calls).toEqual([['or', 'review_status.is.null,review_status.neq.archived']]);
    expect(calls.some(([m]) => m === 'neq')).toBe(false);
  });

  it('all applies nothing, so the archived slice is reachable', () => {
    const { q, calls } = stub();
    applyArchivedView(q, EQUALS, 'all');
    expect(calls).toEqual([]);
  });

  it('a type with no archive block is untouched in every view', () => {
    // Countries. A predicate here would filter on a column that does not exist
    // and PostgREST would 400 the whole list.
    for (const view of ['live', 'archived', 'all'] as const) {
      const { q, calls } = stub();
      applyArchivedView(q, undefined, view);
      expect(calls, `view=${view}`).toEqual([]);
    }
  });

  it('an equals block with no value is left alone rather than guessed at', () => {
    const { q, calls } = stub();
    applyArchivedView(q, { column: 'status' }, 'live');
    expect(calls).toEqual([]);
  });
});
