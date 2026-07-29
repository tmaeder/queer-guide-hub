import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_STATE,
  ENTITY_TYPES,
  MAX_QUERY_LIMIT,
  MAX_SNAPSHOT_ENTRIES,
  sanitizeBlockAttrs,
  sanitizeFilterMap,
  sanitizeSnapshot,
  sanitizeSource,
  sanitizeViewState,
} from '../schema';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

/**
 * These sanitizers are the real enforcement for block attributes: the root
 * `npm run typecheck` checks zero files, and attrs arrive as JSON that has
 * round-tripped through a data-* attribute and DOMPurify.
 */

describe('entity vocabulary', () => {
  it('matches the guide_picks / search_documents CHECK exactly', () => {
    // Drift here becomes a CHECK violation on document_entity_edges.
    expect([...ENTITY_TYPES]).toEqual([
      'venue', 'event', 'marketplace', 'city', 'country', 'queer_village',
      'personality', 'news', 'milestone', 'group', 'organization',
    ]);
    // content_graph_norm_type folds this to 'village'; this vocab must not.
    expect(ENTITY_TYPES).toContain('queer_village');
  });
});

describe('sanitizeFilterMap', () => {
  it('keeps allowlisted keys and drops everything else', () => {
    const out = sanitizeFilterMap({
      city: ['Berlin'],
      safety_gated: false,
      country_id: ['UG'],
      'title); drop table venues; --': ['x'],
    });
    expect(out).toEqual({ city: ['Berlin'] });
  });

  it('drops values of the wrong shape', () => {
    expect(sanitizeFilterMap({ city: 42 })).toEqual({});
    expect(sanitizeFilterMap({ city: [] })).toEqual({});
    expect(sanitizeFilterMap({ city: [1, 2] })).toEqual({});
  });

  it('never throws on junk', () => {
    for (const v of [null, undefined, 'str', 7, []]) {
      expect(() => sanitizeFilterMap(v)).not.toThrow();
      expect(sanitizeFilterMap(v)).toEqual({});
    }
  });
});

describe('sanitizeSource', () => {
  it('keeps only uuid ids, preserving author order and dropping duplicates', () => {
    const out = sanitizeSource({ kind: 'ids', ids: [B, 'nope', A, B, '../../etc/passwd'] });
    expect(out).toEqual({ kind: 'ids', ids: [B, A] });
  });

  it('clamps a query limit into range', () => {
    expect(sanitizeSource({ kind: 'query', limit: 9999 })).toMatchObject({ limit: MAX_QUERY_LIMIT });
    expect(sanitizeSource({ kind: 'query', limit: 0 })).toMatchObject({ limit: 1 });
    expect(sanitizeSource({ kind: 'query', limit: 'abc' })).toMatchObject({ limit: 12 });
  });

  it('strips materialized results smuggled onto a query source', () => {
    // An admin session can see gated entities. Persisting their result set into
    // a document that signed-out readers can read would leak them.
    const out = sanitizeSource({
      kind: 'query',
      limit: 5,
      results: [{ id: A, title: 'Gated venue' }],
      items: ['x'],
      snapshot: [{ t: 'venue', id: A, n: 'Gated' }],
    });
    expect(out).not.toHaveProperty('results');
    expect(out).not.toHaveProperty('items');
    expect(out).not.toHaveProperty('snapshot');
    expect(Object.keys(out).sort()).toEqual(['filters', 'kind', 'limit', 'orderBy']);
  });

  it('defaults to an empty curated source', () => {
    expect(sanitizeSource(null)).toEqual({ kind: 'ids', ids: [] });
    expect(sanitizeSource({ kind: 'nonsense' })).toEqual({ kind: 'ids', ids: [] });
  });
});

describe('sanitizeViewState', () => {
  it('falls back to defaults for unknown vocabulary values', () => {
    const out = sanitizeViewState({ activeLayout: 'hologram', groupByField: 'password' });
    expect(out.activeLayout).toBe(DEFAULT_VIEW_STATE.activeLayout);
    expect(out.groupByField).toBe(DEFAULT_VIEW_STATE.groupByField);
  });

  it('accepts every valid layout', () => {
    for (const layout of ['list', 'gallery', 'kanban', 'timeline', 'calendar']) {
      expect(sanitizeViewState({ activeLayout: layout }).activeLayout).toBe(layout);
    }
  });

  it('bounds the search string', () => {
    expect(sanitizeViewState({ search: 'x'.repeat(9999) }).search).toHaveLength(200);
    expect(sanitizeViewState({ search: 42 }).search).toBe('');
  });
});

describe('sanitizeSnapshot', () => {
  const entry = { t: 'venue', id: A, s: 'berghain', n: 'Berghain' };

  it('keeps well-formed entries for a curated block', () => {
    expect(sanitizeSnapshot([entry], { kind: 'ids', ids: [A] })).toEqual([entry]);
  });

  it('always returns empty for a query block', () => {
    // A query block's membership is dynamic; a stale snapshot could name an
    // entity that has since become gated.
    expect(
      sanitizeSnapshot([entry], { kind: 'query', filters: {}, orderBy: { field: 'title', dir: 'asc' }, limit: 5 }),
    ).toEqual([]);
  });

  it('drops malformed entries', () => {
    const out = sanitizeSnapshot(
      [entry, { t: 'nope', id: A, n: 'x' }, { t: 'venue', id: 'bad', n: 'x' }, { t: 'venue', id: B }],
      { kind: 'ids', ids: [A] },
    );
    expect(out).toEqual([entry]);
  });

  it('caps the number of entries so body_html cannot balloon', () => {
    const many = Array.from({ length: 100 }, () => entry);
    expect(sanitizeSnapshot(many, { kind: 'ids', ids: [A] })).toHaveLength(MAX_SNAPSHOT_ENTRIES);
  });
});

describe('sanitizeBlockAttrs', () => {
  it('produces valid attrs from nothing', () => {
    const out = sanitizeBlockAttrs(undefined);
    expect(out.entityType).toBe('venue');
    expect(out.source).toEqual({ kind: 'ids', ids: [] });
    expect(out.snapshot).toEqual([]);
    expect(out.schemaVersion).toBe(1);
  });

  it('pins schemaVersion regardless of input', () => {
    expect(sanitizeBlockAttrs({ schemaVersion: 99 }).schemaVersion).toBe(1);
  });

  it('rejects an unknown entity type', () => {
    expect(sanitizeBlockAttrs({ entityType: 'hotel' }).entityType).toBe('venue');
  });

  it('never throws', () => {
    for (const v of [null, 0, 'x', [], { source: 'nope', viewState: 7, snapshot: 'no' }]) {
      expect(() => sanitizeBlockAttrs(v)).not.toThrow();
    }
  });
});
