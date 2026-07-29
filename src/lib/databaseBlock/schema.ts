/**
 * Database-block schema: types, closed vocabularies, defaults and validators.
 *
 * PORTABILITY CONTRACT — this module has ZERO imports, and must keep zero.
 * It is imported from BOTH `src/` (via the `@/` alias) and `functions/_lib/`
 * (via a relative `../../src/...` path, the `brandTokens.ts` precedent). The
 * Cloudflare Pages bundle has no `@/` alias and no access to app dependencies,
 * so a single package import here breaks the edge build — which nothing
 * typechecks. `__tests__/portability.test.ts` enforces this.
 *
 * Every vocabulary below is CLOSED on purpose. `FilterKey` in particular is an
 * allowlist, not a denylist: an arbitrary column name would be a filter
 * injection surface on `v_entity_cards`, the one view whose job is to keep
 * safety-gated entities away from signed-out readers.
 */

/**
 * ProseMirror node name. Shared so the Tiptap extension, the document walker
 * and the edge middleware cannot disagree about what a block looks like.
 */
export const DATABASE_BLOCK_NODE_NAME = 'databaseBlock';

/* ------------------------------------------------------------------ */
/*  Entity vocabulary                                                  */
/* ------------------------------------------------------------------ */

/**
 * Matches the `guide_picks.entity_type` CHECK and `search_documents.entity_type`
 * verbatim. Do NOT normalize through `content_graph_norm_type()` — it folds
 * `queer_village` to `village`, which violates the CHECK.
 */
export const ENTITY_TYPES = [
  'venue',
  'event',
  'marketplace',
  'city',
  'country',
  'queer_village',
  'personality',
  'news',
  'milestone',
  'group',
  'organization',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/* ------------------------------------------------------------------ */
/*  View vocabularies                                                  */
/* ------------------------------------------------------------------ */

export const LAYOUTS = ['list', 'gallery', 'kanban', 'timeline', 'calendar'] as const;
export type LayoutId = (typeof LAYOUTS)[number];

/** Columns a kanban view may group by. Closed: each maps to a resolver in normalize.ts. */
export const GROUP_BY_FIELDS = [
  'entity_type',
  'city',
  'country',
  'category',
  'liveness_status',
  'is_featured',
  'start_month',
] as const;
export type GroupByField = (typeof GROUP_BY_FIELDS)[number];

/** Date columns a timeline/calendar view may plot against. */
export const DATE_FIELDS = ['start_date', 'end_date', 'updated_at'] as const;
export type DateFieldId = (typeof DATE_FIELDS)[number];

export const SORT_FIELDS = [
  'title',
  'start_date',
  'end_date',
  'updated_at',
  'quality_score',
  'price_min',
  'manual',
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export interface SortConfig {
  field: SortField;
  dir: 'asc' | 'desc';
}

/**
 * Filterable columns. `safety_gated` and `country_id` are deliberately absent
 * and must stay absent — a block that can filter on gatedness is an enumerator
 * for entities in criminalizing countries.
 */
export const FILTER_KEYS = [
  'city',
  'country',
  'category',
  'liveness_status',
  'is_featured',
  'is_free',
  'start_date',
  'price',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export type FilterValue =
  | string[]
  | boolean
  | { from?: string; to?: string }
  | 'is.null'
  | 'not.is.null';

export type FilterMap = Partial<Record<FilterKey, FilterValue>>;

/* ------------------------------------------------------------------ */
/*  Block attributes                                                   */
/* ------------------------------------------------------------------ */

/** Server-enforced ceiling on a live query's result set. */
export const MAX_QUERY_LIMIT = 48;
/** Entries persisted into the crawlable `body_html` snapshot. */
export const MAX_SNAPSHOT_ENTRIES = 24;

export type BlockSource =
  | { kind: 'ids'; ids: string[] }
  | { kind: 'query'; filters: FilterMap; orderBy: SortConfig; limit: number };

export interface BlockViewState {
  activeLayout: LayoutId;
  sortConfig: SortConfig;
  /**
   * READER-side refinement. Distinct from `source.filters`, which is the
   * author's definition of what belongs in the block. Both persist: the
   * author's reader-state becomes everyone's default, as in Notion.
   */
  filters: FilterMap;
  search: string;
  groupByField: GroupByField;
  dateStartField: DateFieldId;
  dateEndField: DateFieldId;
}

/**
 * Trimmed projection persisted into `body_html` so crawlers see real links.
 * NEVER contains safety-gated entities, and is never written for query blocks.
 */
export interface SnapshotEntry {
  /** entity type */ t: EntityType;
  /** entity id */ id: string;
  /** slug, null when the entity has none */ s: string | null;
  /** display name */ n: string;
}

export interface DatabaseBlockAttrs {
  blockId: string;
  entityType: EntityType;
  source: BlockSource;
  viewState: BlockViewState;
  snapshot: SnapshotEntry[];
  schemaVersion: 1;
}

export const SCHEMA_VERSION = 1 as const;

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

export const DEFAULT_SORT: SortConfig = { field: 'manual', dir: 'asc' };

export const DEFAULT_VIEW_STATE: BlockViewState = {
  activeLayout: 'list',
  sortConfig: DEFAULT_SORT,
  filters: {},
  search: '',
  groupByField: 'category',
  dateStartField: 'start_date',
  dateEndField: 'end_date',
};

export const DEFAULT_SOURCE: BlockSource = { kind: 'ids', ids: [] };

/* ------------------------------------------------------------------ */
/*  Runtime validation                                                 */
/* ------------------------------------------------------------------ */

/*
 * These run against JSON that has round-tripped through a `data-*` attribute
 * and DOMPurify, so they must tolerate anything and never throw. Repo-wide
 * `tsc` does not run (root tsconfig is solution-style with `files: []`), so
 * these validators — not the type system — are the real enforcement.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

export const isEntityType = (v: unknown): v is EntityType =>
  typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v);

/** UUID v1–v5, case-insensitive. Rejects anything else so ids can't smuggle SQL. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

function sanitizeFilterValue(v: unknown): FilterValue | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'is.null' || v === 'not.is.null') return v;
  if (Array.isArray(v)) {
    const out = v.filter((x): x is string => typeof x === 'string');
    return out.length ? out : undefined;
  }
  if (isRecord(v)) {
    const from = typeof v.from === 'string' ? v.from : undefined;
    const to = typeof v.to === 'string' ? v.to : undefined;
    return from || to ? { from, to } : undefined;
  }
  return undefined;
}

/** Drops unknown keys entirely — the allowlist is the security boundary. */
export function sanitizeFilterMap(v: unknown): FilterMap {
  if (!isRecord(v)) return {};
  const out: FilterMap = {};
  for (const key of FILTER_KEYS) {
    if (!(key in v)) continue;
    const val = sanitizeFilterValue(v[key]);
    if (val !== undefined) out[key] = val;
  }
  return out;
}

export function sanitizeSortConfig(v: unknown): SortConfig {
  if (!isRecord(v)) return { ...DEFAULT_SORT };
  return {
    field: oneOf(SORT_FIELDS, v.field, DEFAULT_SORT.field),
    dir: v.dir === 'desc' ? 'desc' : 'asc',
  };
}

export function sanitizeViewState(v: unknown): BlockViewState {
  if (!isRecord(v)) return { ...DEFAULT_VIEW_STATE, filters: {} };
  return {
    activeLayout: oneOf(LAYOUTS, v.activeLayout, DEFAULT_VIEW_STATE.activeLayout),
    sortConfig: sanitizeSortConfig(v.sortConfig),
    filters: sanitizeFilterMap(v.filters),
    search: typeof v.search === 'string' ? v.search.slice(0, 200) : '',
    groupByField: oneOf(GROUP_BY_FIELDS, v.groupByField, DEFAULT_VIEW_STATE.groupByField),
    dateStartField: oneOf(DATE_FIELDS, v.dateStartField, DEFAULT_VIEW_STATE.dateStartField),
    dateEndField: oneOf(DATE_FIELDS, v.dateEndField, DEFAULT_VIEW_STATE.dateEndField),
  };
}

/**
 * A query source may never carry materialized results. Any `results`/`items`/
 * `snapshot` key is dropped here so an admin's privileged result set cannot be
 * persisted into a document that signed-out readers can read.
 */
export function sanitizeSource(v: unknown): BlockSource {
  if (!isRecord(v)) return { kind: 'ids', ids: [] };
  if (v.kind === 'query') {
    const rawLimit = typeof v.limit === 'number' && Number.isFinite(v.limit) ? v.limit : 12;
    return {
      kind: 'query',
      filters: sanitizeFilterMap(v.filters),
      orderBy: sanitizeSortConfig(v.orderBy),
      limit: Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.floor(rawLimit))),
    };
  }
  const ids = Array.isArray(v.ids) ? v.ids.filter(isUuid) : [];
  // Preserve author order, drop duplicates.
  return { kind: 'ids', ids: [...new Set(ids)] };
}

export function sanitizeSnapshot(v: unknown, source: BlockSource): SnapshotEntry[] {
  // Query blocks never carry a snapshot: their membership is dynamic, and a
  // stale snapshot authored by an admin could name a since-gated entity.
  if (source.kind === 'query' || !Array.isArray(v)) return [];
  const out: SnapshotEntry[] = [];
  for (const raw of v) {
    if (out.length >= MAX_SNAPSHOT_ENTRIES) break;
    if (!isRecord(raw)) continue;
    if (!isEntityType(raw.t) || !isUuid(raw.id) || typeof raw.n !== 'string' || !raw.n) continue;
    out.push({
      t: raw.t,
      id: raw.id,
      s: typeof raw.s === 'string' && raw.s ? raw.s : null,
      n: raw.n.slice(0, 200),
    });
  }
  return out;
}

/** Normalizes arbitrary parsed JSON into valid attrs. Never throws. */
export function sanitizeBlockAttrs(v: unknown): DatabaseBlockAttrs {
  const raw = isRecord(v) ? v : {};
  const source = sanitizeSource(raw.source);
  return {
    blockId: typeof raw.blockId === 'string' && raw.blockId ? raw.blockId.slice(0, 64) : '',
    entityType: isEntityType(raw.entityType) ? raw.entityType : 'venue',
    source,
    viewState: sanitizeViewState(raw.viewState),
    snapshot: sanitizeSnapshot(raw.snapshot, source),
    schemaVersion: SCHEMA_VERSION,
  };
}
