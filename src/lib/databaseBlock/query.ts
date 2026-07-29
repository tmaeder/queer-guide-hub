/**
 * Translates block filter state into a query against `public.v_entity_cards`.
 *
 * PORTABILITY CONTRACT — relative imports only (see ./schema). Emits a neutral
 * operation list that both callers render: supabase-js in the browser, a
 * PostgREST querystring in the Cloudflare middleware. One translation, so the
 * seeded payload and the client refetch cannot disagree about what the block
 * contains.
 *
 * SECURITY: every column touched here is resolved through `FILTER_COLUMNS` /
 * `SORT_COLUMNS`, both closed maps keyed by the closed vocabularies in
 * ./schema. No caller-supplied string ever reaches a column position, so a
 * hostile `viewState` cannot select or order by an arbitrary column. Nothing
 * here can target `safety_gated` — and even if it could, the gate lives in the
 * view body, not in this query.
 */

import {
  MAX_QUERY_LIMIT,
  type BlockSource,
  type EntityType,
  type FilterKey,
  type FilterMap,
  type FilterValue,
  type SortConfig,
  type SortField,
} from './schema';

/** Columns selected for a card. Mirrors what normalizeEntityCard reads. */
export const ENTITY_CARD_COLUMNS = [
  'doc_id',
  'entity_type',
  'entity_id',
  'slug',
  'title',
  'description',
  'image_url',
  'city',
  'country',
  'start_date',
  'end_date',
  'is_free',
  'price_min',
  'price_max',
  'is_featured',
  'quality_score',
  'liveness_status',
  'facets',
  'is_gated',
  'updated_at',
].join(', ');

export const ENTITY_CARD_RELATION = 'v_entity_cards';

/** Filter key → column expression. Closed map; unknown keys are unreachable. */
const FILTER_COLUMNS: Record<FilterKey, string> = {
  city: 'city',
  country: 'country',
  // `category` is not a column — it lives in the facets jsonb.
  category: 'facets->>category',
  liveness_status: 'liveness_status',
  is_featured: 'is_featured',
  is_free: 'is_free',
  start_date: 'start_date',
  price: 'price_min',
};

/** Sort field → column. `manual` means "preserve author order", handled client-side. */
const SORT_COLUMNS: Record<Exclude<SortField, 'manual'>, string> = {
  title: 'title',
  start_date: 'start_date',
  end_date: 'end_date',
  updated_at: 'updated_at',
  quality_score: 'quality_score',
  price_min: 'price_min',
};

export type QueryOp =
  | { op: 'eq'; column: string; value: string | number | boolean }
  | { op: 'in'; column: string; values: string[] }
  | { op: 'gte'; column: string; value: string | number }
  | { op: 'lte'; column: string; value: string | number }
  | { op: 'is'; column: string; value: null }
  | { op: 'not_is'; column: string; value: null };

export interface EntityCardQuery {
  relation: string;
  columns: string;
  entityType: EntityType;
  ops: QueryOp[];
  /** Null when the caller must preserve author-defined order. */
  order: { column: string; ascending: boolean } | null;
  limit: number;
  /** Set for `kind: 'ids'`; the caller re-sorts into this order. */
  ids: string[] | null;
}

function opsForFilter(key: FilterKey, value: FilterValue): QueryOp[] {
  const column = FILTER_COLUMNS[key];
  if (!column) return [];

  if (value === 'is.null') return [{ op: 'is', column, value: null }];
  if (value === 'not.is.null') return [{ op: 'not_is', column, value: null }];
  if (typeof value === 'boolean') return [{ op: 'eq', column, value }];

  if (Array.isArray(value)) {
    const values = value.filter((v) => typeof v === 'string' && v !== '');
    return values.length ? [{ op: 'in', column, values }] : [];
  }

  if (typeof value === 'object' && value !== null) {
    const out: QueryOp[] = [];
    if (value.from) out.push({ op: 'gte', column, value: value.from });
    if (value.to) out.push({ op: 'lte', column, value: value.to });
    return out;
  }

  return [];
}

export function filterMapToOps(filters: FilterMap): QueryOp[] {
  const ops: QueryOp[] = [];
  // Iterate the closed key list, not Object.keys(filters), so an unexpected key
  // on the object cannot contribute an operation.
  for (const key of Object.keys(FILTER_COLUMNS) as FilterKey[]) {
    const value = filters[key];
    if (value === undefined) continue;
    ops.push(...opsForFilter(key, value));
  }
  return ops;
}

function orderFor(sort: SortConfig): EntityCardQuery['order'] {
  if (sort.field === 'manual') return null;
  const column = SORT_COLUMNS[sort.field];
  if (!column) return null;
  return { column, ascending: sort.dir !== 'desc' };
}

/**
 * Builds the query for one block.
 *
 * `kind: 'ids'` fetches exactly the referenced entities and returns them for
 * client-side reordering — PostgREST cannot order by array position, and author
 * order is meaningful for a curated block.
 */
export function buildEntityCardQuery(
  entityType: EntityType,
  source: BlockSource,
  overrides: { limit?: number } = {},
): EntityCardQuery {
  const base: Omit<EntityCardQuery, 'ops' | 'order' | 'limit' | 'ids'> = {
    relation: ENTITY_CARD_RELATION,
    columns: ENTITY_CARD_COLUMNS,
    entityType,
  };

  if (source.kind === 'ids') {
    return {
      ...base,
      ops: [{ op: 'eq', column: 'entity_type', value: entityType }],
      order: null,
      limit: Math.min(source.ids.length || 1, MAX_QUERY_LIMIT),
      ids: [...source.ids],
    };
  }

  const limit = Math.max(
    1,
    Math.min(overrides.limit ?? source.limit, MAX_QUERY_LIMIT),
  );

  return {
    ...base,
    ops: [
      { op: 'eq', column: 'entity_type', value: entityType },
      ...filterMapToOps(source.filters),
    ],
    order: orderFor(source.orderBy),
    limit,
    ids: null,
  };
}

/* ------------------------------------------------------------------ */
/*  PostgREST querystring (edge)                                       */
/* ------------------------------------------------------------------ */

function encodeInList(values: string[]): string {
  // PostgREST in.(...) — quote each value and escape embedded quotes so a value
  // containing a comma or paren cannot break out of the list.
  const escaped = values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `in.(${escaped.join(',')})`;
}

/**
 * Renders the query as a PostgREST querystring for the Cloudflare middleware,
 * which has no supabase-js.
 */
export function toPostgrestQueryString(query: EntityCardQuery): string {
  const params = new URLSearchParams();
  params.set('select', query.columns);

  for (const op of query.ops) {
    switch (op.op) {
      case 'eq':
        params.append(op.column, `eq.${String(op.value)}`);
        break;
      case 'in':
        params.append(op.column, encodeInList(op.values));
        break;
      case 'gte':
        params.append(op.column, `gte.${String(op.value)}`);
        break;
      case 'lte':
        params.append(op.column, `lte.${String(op.value)}`);
        break;
      case 'is':
        params.append(op.column, 'is.null');
        break;
      case 'not_is':
        params.append(op.column, 'not.is.null');
        break;
    }
  }

  if (query.ids) params.append('entity_id', encodeInList(query.ids));
  if (query.order) {
    params.set('order', `${query.order.column}.${query.order.ascending ? 'asc' : 'desc'}`);
  }
  params.set('limit', String(query.limit));

  return params.toString();
}

/* ------------------------------------------------------------------ */
/*  Client-side derivation                                             */
/* ------------------------------------------------------------------ */

/** Restores author order for a curated block; PostgREST cannot sort by array position. */
export function reorderByIds<T extends { entityId: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.entityId, r]));
  const out: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    // Absent ids are deleted entities, or entities gated for this reader.
    // Dropping them is the correct behaviour: absence, never a placeholder.
    if (row) out.push(row);
  }
  return out;
}
