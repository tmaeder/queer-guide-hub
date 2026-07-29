import { describe, expect, it } from 'vitest';
import { DATABASE_BLOCK_NODE_NAME } from '../schema';
import { documentToEdgeRows, hasDatabaseBlocks, parseDatabaseBlocks, toEdgeRows } from '../parse';

const VENUE_A = '11111111-1111-4111-8111-111111111111';
const VENUE_B = '22222222-2222-4222-8222-222222222222';

function block(attrs: Record<string, unknown>) {
  return { type: DATABASE_BLOCK_NODE_NAME, attrs };
}

const idsBlock = (id: string, ids: string[]) =>
  block({ blockId: id, entityType: 'venue', source: { kind: 'ids', ids }, schemaVersion: 1 });

const queryBlock = (id: string) =>
  block({
    blockId: id,
    entityType: 'event',
    source: { kind: 'query', filters: { city: ['Berlin'] }, orderBy: { field: 'start_date', dir: 'asc' }, limit: 10 },
    schemaVersion: 1,
  });

const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('parseDatabaseBlocks', () => {
  it('finds blocks in document order and indexes them', () => {
    const parsed = parseDatabaseBlocks(
      doc({ type: 'paragraph' }, idsBlock('a', [VENUE_A]), { type: 'paragraph' }, queryBlock('b')),
    );
    expect(parsed.map((b) => [b.blockId, b.blockIndex])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('finds blocks nested inside other nodes', () => {
    const parsed = parseDatabaseBlocks(
      doc({ type: 'blockquote', content: [{ type: 'bulletList', content: [idsBlock('deep', [VENUE_A])] }] }),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].blockId).toBe('deep');
  });

  it('returns no entityIds for a query block', () => {
    const [parsed] = parseDatabaseBlocks(doc(queryBlock('q')));
    expect(parsed.source.kind).toBe('query');
    expect(parsed.entityIds).toEqual([]);
  });

  it('parses attributes that round-tripped through data-* as JSON strings', () => {
    // parseHTML hands attribute values back as strings.
    const stringified = block({
      blockId: 'html',
      entityType: 'venue',
      source: JSON.stringify({ kind: 'ids', ids: [VENUE_A, VENUE_B] }),
      viewState: JSON.stringify({ activeLayout: 'gallery' }),
    });
    const [parsed] = parseDatabaseBlocks(doc(stringified));
    expect(parsed.entityIds).toEqual([VENUE_A, VENUE_B]);
    expect(parsed.viewState.activeLayout).toBe('gallery');
  });

  it('falls back to a positional id when blockId is missing', () => {
    const [parsed] = parseDatabaseBlocks(doc(block({ entityType: 'venue' })));
    expect(parsed.blockId).toBe('idx-0');
  });

  it('drops non-uuid entity ids', () => {
    const [parsed] = parseDatabaseBlocks(
      doc(idsBlock('a', [VENUE_A, 'not-a-uuid', '"; drop table venues; --'])),
    );
    expect(parsed.entityIds).toEqual([VENUE_A]);
  });

  it('never throws on malformed input', () => {
    // cms_pages.body_json still holds the legacy crisis-hotline payload.
    for (const input of [null, undefined, 42, 'string', [], {}, { hotlines: [{ name: 'x' }] }]) {
      expect(() => parseDatabaseBlocks(input)).not.toThrow();
      expect(parseDatabaseBlocks(input)).toEqual([]);
    }
  });

  it('survives a self-referential document without hanging', () => {
    const cyclic: Record<string, unknown> = { type: 'doc' };
    cyclic.content = [cyclic];
    expect(() => parseDatabaseBlocks(cyclic)).not.toThrow();
  });

  it('hasDatabaseBlocks matches parse', () => {
    expect(hasDatabaseBlocks(doc({ type: 'paragraph' }))).toBe(false);
    expect(hasDatabaseBlocks(doc(idsBlock('a', [VENUE_A])))).toBe(true);
  });
});

describe('toEdgeRows', () => {
  it('emits one static row per referenced entity, carrying position', () => {
    const rows = documentToEdgeRows(doc(idsBlock('a', [VENUE_A, VENUE_B])));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      edge_kind: 'static',
      entity_type: 'venue',
      entity_id: VENUE_A,
      position: 0,
      query_spec: null,
    });
    expect(rows[1].position).toBe(1);
  });

  it('emits exactly ONE row for a query block, with the spec and no entity_id', () => {
    // Materializing members would go stale on every new entity and storm writes.
    const rows = documentToEdgeRows(doc(queryBlock('q')));
    expect(rows).toHaveLength(1);
    expect(rows[0].edge_kind).toBe('query');
    expect(rows[0].entity_id).toBeNull();
    expect(rows[0].query_spec).toMatchObject({ kind: 'query' });
  });

  it('every row satisfies the document_entity_edges_shape CHECK', () => {
    const rows = documentToEdgeRows(doc(idsBlock('a', [VENUE_A]), queryBlock('q')));
    for (const row of rows) {
      const staticOk = row.edge_kind === 'static' && row.entity_id !== null && row.query_spec === null;
      const queryOk = row.edge_kind === 'query' && row.entity_id === null && row.query_spec !== null;
      expect(staticOk || queryOk).toBe(true);
    }
  });

  it('produces no rows for an empty document', () => {
    expect(toEdgeRows([])).toEqual([]);
    expect(documentToEdgeRows(doc({ type: 'paragraph' }))).toEqual([]);
  });
});
