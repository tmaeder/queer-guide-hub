/**
 * ProseMirror document walker: finds database blocks and the entities they
 * reference.
 *
 * PORTABILITY CONTRACT — relative imports only (see ./schema). This runs both
 * in the browser (to compute edges on save) and in the Cloudflare Pages
 * middleware (to decide what to pre-hydrate), and both must agree exactly.
 *
 * Tolerates anything: a null document, the legacy `{hotlines: [...]}` shape
 * that `cms_pages.body_json` still holds, attributes that round-tripped through
 * a `data-*` attribute as strings, and unknown node types. It never throws —
 * edges are derived bookkeeping, and a malformed document must not be able to
 * break a page render or block an editor from saving.
 */

import {
  DATABASE_BLOCK_NODE_NAME,
  sanitizeBlockAttrs,
  type BlockSource,
  type BlockViewState,
  type DatabaseBlockAttrs,
  type EntityType,
} from './schema';

export interface DatabaseBlockRef {
  blockId: string;
  /** 0-based position in document order. */
  blockIndex: number;
  entityType: EntityType;
  source: BlockSource;
  viewState: BlockViewState;
  /** Static ids for `kind: 'ids'`; always empty for `kind: 'query'`. */
  entityIds: string[];
}

export interface DocumentEdgeRow {
  block_id: string;
  block_index: number;
  edge_kind: 'static' | 'query';
  entity_type: EntityType;
  entity_id: string | null;
  position: number;
  query_spec: BlockSource | null;
}

/** Guard against pathological/hostile nesting depth. */
const MAX_DEPTH = 64;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Attribute values survive a `data-*` round-trip as JSON strings. Accept both
 * the parsed object (in-editor) and the string form (parsed back from HTML).
 */
function coerceAttr(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function readBlockAttrs(node: Record<string, unknown>): DatabaseBlockAttrs {
  const rawAttrs = isRecord(node.attrs) ? node.attrs : {};
  const coerced: Record<string, unknown> = {};
  for (const key of Object.keys(rawAttrs)) coerced[key] = coerceAttr(rawAttrs[key]);
  return sanitizeBlockAttrs(coerced);
}

/**
 * Walks any ProseMirror-shaped value and returns its database blocks in
 * document order.
 */
export function parseDatabaseBlocks(doc: unknown): DatabaseBlockRef[] {
  const found: DatabaseBlockRef[] = [];
  if (!isRecord(doc)) return found;

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || !isRecord(node)) return;

    if (node.type === DATABASE_BLOCK_NODE_NAME) {
      const attrs = readBlockAttrs(node);
      found.push({
        // Fall back to document position so a block that lost its id is still
        // addressable rather than silently dropped.
        blockId: attrs.blockId || `idx-${found.length}`,
        blockIndex: found.length,
        entityType: attrs.entityType,
        source: attrs.source,
        viewState: attrs.viewState,
        entityIds: attrs.source.kind === 'ids' ? attrs.source.ids : [],
      });
      // `atom: true` — a database block has no children worth descending into.
      return;
    }

    const children = node.content;
    if (Array.isArray(children)) {
      for (const child of children) visit(child, depth + 1);
    }
  };

  visit(doc, 0);
  return found;
}

/** True when the document contains at least one block. Cheaper than parsing. */
export function hasDatabaseBlocks(doc: unknown): boolean {
  return parseDatabaseBlocks(doc).length > 0;
}

/**
 * Flattens blocks into rows for `sync_document_entity_edges`.
 *
 * A `kind: 'query'` block yields exactly ONE row with a null entity_id and the
 * query in `query_spec` — its membership is dynamic, so materializing members
 * would go stale on every new entity and storm writes. Consumers read static
 * edges exactly, plus "this document runs a live query over <type>" as a
 * weaker signal.
 */
export function toEdgeRows(blocks: DatabaseBlockRef[]): DocumentEdgeRow[] {
  const rows: DocumentEdgeRow[] = [];

  for (const block of blocks) {
    if (block.source.kind === 'query') {
      rows.push({
        block_id: block.blockId,
        block_index: block.blockIndex,
        edge_kind: 'query',
        entity_type: block.entityType,
        entity_id: null,
        position: 0,
        query_spec: block.source,
      });
      continue;
    }

    block.entityIds.forEach((entityId, position) => {
      rows.push({
        block_id: block.blockId,
        block_index: block.blockIndex,
        edge_kind: 'static',
        entity_type: block.entityType,
        entity_id: entityId,
        position,
        query_spec: null,
      });
    });
  }

  return rows;
}

/** Convenience: document → edge rows in one step. */
export function documentToEdgeRows(doc: unknown): DocumentEdgeRow[] {
  return toEdgeRows(parseDatabaseBlocks(doc));
}
