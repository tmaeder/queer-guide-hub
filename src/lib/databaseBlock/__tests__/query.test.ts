import { describe, expect, it } from 'vitest';
import { MAX_QUERY_LIMIT, type BlockSource } from '../schema';
import {
  ENTITY_CARD_RELATION,
  buildEntityCardQuery,
  filterMapToOps,
  reorderByIds,
  toPostgrestQueryString,
} from '../query';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const query = (over: Partial<Extract<BlockSource, { kind: 'query' }>> = {}): BlockSource => ({
  kind: 'query',
  filters: {},
  orderBy: { field: 'start_date', dir: 'asc' },
  limit: 12,
  ...over,
});

describe('filterMapToOps', () => {
  it('translates each filter value shape to the right operator', () => {
    expect(filterMapToOps({ city: ['Berlin', 'Paris'] })).toEqual([
      { op: 'in', column: 'city', values: ['Berlin', 'Paris'] },
    ]);
    expect(filterMapToOps({ is_featured: true })).toEqual([
      { op: 'eq', column: 'is_featured', value: true },
    ]);
    expect(filterMapToOps({ start_date: { from: '2026-01-01', to: '2026-12-31' } })).toEqual([
      { op: 'gte', column: 'start_date', value: '2026-01-01' },
      { op: 'lte', column: 'start_date', value: '2026-12-31' },
    ]);
    expect(filterMapToOps({ city: 'is.null' })).toEqual([{ op: 'is', column: 'city', value: null }]);
    expect(filterMapToOps({ city: 'not.is.null' })).toEqual([
      { op: 'not_is', column: 'city', value: null },
    ]);
  });

  it('maps category to the facets jsonb, which is not a real column', () => {
    expect(filterMapToOps({ category: ['club'] })).toEqual([
      { op: 'in', column: 'facets->>category', values: ['club'] },
    ]);
  });

  it('ignores keys outside the closed allowlist', () => {
    const hostile = {
      safety_gated: false,
      'title; drop table venues': ['x'],
      country_id: ['UG'],
    } as unknown as Parameters<typeof filterMapToOps>[0];
    expect(filterMapToOps(hostile)).toEqual([]);
  });

  it('drops empty arrays rather than emitting an empty IN', () => {
    expect(filterMapToOps({ city: [] })).toEqual([]);
  });
});

describe('buildEntityCardQuery', () => {
  it('always constrains entity_type', () => {
    const q = buildEntityCardQuery('event', query());
    expect(q.relation).toBe(ENTITY_CARD_RELATION);
    expect(q.ops).toContainEqual({ op: 'eq', column: 'entity_type', value: 'event' });
  });

  it('reads from the gated view, never search_documents', () => {
    // The view body is what keeps gated entities away from signed-out readers.
    expect(buildEntityCardQuery('venue', query()).relation).toBe('v_entity_cards');
  });

  it('caps limit at MAX_QUERY_LIMIT', () => {
    expect(buildEntityCardQuery('venue', query({ limit: 5000 })).limit).toBe(MAX_QUERY_LIMIT);
    expect(buildEntityCardQuery('venue', query({ limit: 6 })).limit).toBe(6);
  });

  it('returns ids for a curated block so author order can be restored', () => {
    const q = buildEntityCardQuery('venue', { kind: 'ids', ids: [B, A] });
    expect(q.ids).toEqual([B, A]);
    expect(q.order).toBeNull();
  });

  it('translates sort direction, and treats manual as no server order', () => {
    expect(buildEntityCardQuery('venue', query({ orderBy: { field: 'title', dir: 'desc' } })).order)
      .toEqual({ column: 'title', ascending: false });
    expect(buildEntityCardQuery('venue', query({ orderBy: { field: 'manual', dir: 'asc' } })).order)
      .toBeNull();
  });
});

describe('toPostgrestQueryString', () => {
  it('renders filters, order and limit', () => {
    const qs = toPostgrestQueryString(
      buildEntityCardQuery('event', query({ filters: { city: ['Berlin'] }, limit: 5 })),
    );
    const params = new URLSearchParams(qs);
    expect(params.get('entity_type')).toBe('eq.event');
    expect(params.get('city')).toBe('in.("Berlin")');
    expect(params.get('order')).toBe('start_date.asc');
    expect(params.get('limit')).toBe('5');
    expect(params.get('select')).toContain('entity_id');
  });

  it('quotes IN values so a comma or paren cannot break out of the list', () => {
    const qs = toPostgrestQueryString(
      buildEntityCardQuery('venue', query({ filters: { city: ['Paris, France', 'a)b'] } })),
    );
    expect(new URLSearchParams(qs).get('city')).toBe('in.("Paris, France","a)b")');
  });

  it('escapes embedded quotes', () => {
    const qs = toPostgrestQueryString(
      buildEntityCardQuery('venue', query({ filters: { city: ['say "hi"'] } })),
    );
    expect(new URLSearchParams(qs).get('city')).toBe('in.("say \\"hi\\"")');
  });

  it('constrains a curated block to its ids', () => {
    const qs = toPostgrestQueryString(buildEntityCardQuery('venue', { kind: 'ids', ids: [A, B] }));
    expect(new URLSearchParams(qs).get('entity_id')).toBe(`in.("${A}","${B}")`);
  });

  it('never emits a safety_gated parameter', () => {
    const qs = toPostgrestQueryString(
      buildEntityCardQuery('venue', query({ filters: { city: ['Berlin'] } })),
    );
    expect(qs).not.toContain('safety_gated');
    expect(qs).not.toContain('is_gated=');
  });
});

describe('reorderByIds', () => {
  it('restores author order', () => {
    const rows = [{ entityId: A }, { entityId: B }];
    expect(reorderByIds(rows, [B, A]).map((r) => r.entityId)).toEqual([B, A]);
  });

  it('drops ids with no row — deleted or gated for this reader', () => {
    // Absence is correct here; a placeholder would leak that something exists.
    expect(reorderByIds([{ entityId: A }], [A, B]).map((r) => r.entityId)).toEqual([A]);
  });
});
