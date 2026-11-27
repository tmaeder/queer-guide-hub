import { hashKey, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useDebounce } from './useDebounce';
import { useLoadingTimedOut } from './useLoadingTimedOut';
import {
  searchCountKey,
  searchFetch,
  SearchFetchException,
  SEARCH_UNAVAILABLE_MESSAGE,
  isSearchUnavailable,
} from '@/lib/searchFetch';
import { resolveType } from '@/lib/searchTaxonomy';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

// P2-8: queries shorter than this never reach the network. The worker accepts
// short queries (returns []) but a single-character query is overwhelmingly a
// mid-typing artefact, so we suppress the request and surface a "keep typing"
// empty state instead of a confusing "0 results".
const MIN_QUERY_LEN = 2;

export interface SearchResult {
  objectID: string;
  title: string;
  description?: string;
  type: string;
  category?: string;
  location?: string;
  price?: number;
  date?: string;
  rating?: number;
  imageUrl?: string;
  /** Content tags (worker returns facets->'tags' top-level as `tags`). */
  tags?: string[];
  /** URL slug for the detail route (worker returns this top-level). */
  slug?: string;
  /** Geo coords when the entity has them (venues, events, places, villages). */
  _geoloc?: { lat: number; lng: number };
  /** Metres from the active geo filter centre (worker sets this when lat/lng given). */
  _distance_m?: number;
  /** Personalization signal that boosted this hit (worker `rank.ts`). */
  _boostReason?: 'interest' | 'recent_tag' | 'home_city' | 'recent_city' | 'featured' | null;
  metadata?: Record<string, unknown>;
  _highlightResult?: Record<string, unknown>;
}

export interface SearchFilters {
  types?: string[];
  location?: string;
  categories?: string[];
  /** Topic-cluster UUIDs (#171 / #225). Filterable via `cluster_ids`. */
  cluster_ids?: string[];
  /** Audience tags (lesbian, trans, …) — search_hybrid any-of facet match. */
  target_groups?: string[];
  /**
   * Content tags (leather, gay-bar, …) — search_hybrid any-of facet match.
   * Values are the raw tokens stored in entity `.tags` (slugs), so they match
   * the facet keys and the venue/event/group tag arrays exactly.
   */
  tags?: string[];
  priceRange?: [number, number];
  dateRange?: [Date, Date];
  rating?: number;
  featured?: boolean;
  /** Free-entry only (events/marketplace) → worker is_free. */
  free?: boolean;
  verified?: boolean;
  /** Geo radius — worker turns these into a PostGIS radius filter. */
  lat?: number;
  lng?: number;
  radius?: number;
}

/**
 * Translate the UI's camelCase SearchFilters into the worker's accepted filter
 * keys (validation.ts FILTER_KEYS). Maps types→indexKeys, priceRange→
 * price_min/max, dateRange→date_from/to (ISO), free→is_free; drops UI-only
 * fields with no backend (rating, verified). `sort` is the worker p_sort.
 */
export function toWorkerFilters(filters: SearchFilters, sort?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // The worker's filters.types enum is the singular entity type (venue, event,
  // …) — which is exactly our scope id. (Do NOT map to plural index keys; the
  // worker rejects "events"/"venues" as invalid_enum.)
  if (filters.types?.length) out.types = filters.types;
  if (filters.location) out.location = filters.location;
  if (filters.categories?.length) out.categories = filters.categories;
  if (filters.cluster_ids?.length) out.cluster_ids = filters.cluster_ids;
  if (filters.target_groups?.length) out.target_groups = filters.target_groups;
  if (filters.tags?.length) out.tags = filters.tags;
  if (filters.featured) out.featured = true;
  if (filters.free) out.is_free = true;
  if (filters.lat != null) out.lat = filters.lat;
  if (filters.lng != null) out.lng = filters.lng;
  if (filters.radius != null) out.radius = filters.radius;
  if (filters.priceRange) {
    out.price_min = filters.priceRange[0];
    out.price_max = filters.priceRange[1];
  }
  if (filters.dateRange) {
    out.date_from = filters.dateRange[0].toISOString();
    out.date_to = filters.dateRange[1].toISOString();
  }
  if (sort && sort !== 'relevance') out.sort = sort;
  return out;
}

export interface FacetDistribution {
  [facet: string]: Record<string, number>;
}

export type SearchErrorKind = 'unavailable' | 'client_error' | null;

interface SearchResponse {
  hits?: SearchResult[];
  suggestions?: SearchResult[];
  facetDistribution?: FacetDistribution;
  /** The worker answered before search_facets did; fetch them with facetsOnly. */
  facetsPending?: boolean;
  totalHits?: number;
  page?: number;
  hitsPerPage?: number;
}

/**
 * True when the filters alone can drive a browse (no keyword needed) — the worker
 * runs an empty-query browse via search_hybrid. Powers tag/facet-only result lists
 * (e.g. the glossary "Search everything tagged X" bridge → /search?tags=…).
 */
function hasBrowseFilters(f: SearchFilters): boolean {
  return !!(
    // `types` counts. It was omitted, so `useSearch('', { types: ['event'] })`
    // fired no request at all and rendered an empty list with no error — a
    // type-scoped browse looked identical to a broken one. The worker accepts
    // an empty query with a types filter (validation.ts FILTER_KEYS), so this
    // was a client-side gate, not a backend limitation.
    f.types?.length ||
    f.tags?.length ||
    f.categories?.length ||
    f.target_groups?.length ||
    f.location ||
    f.priceRange ||
    f.dateRange ||
    f.featured ||
    f.free ||
    (f.lat != null && f.lng != null)
  );
}

const FORBIDDEN_FACET_KEYS = new Set(['undefined', 'null', '']);

/**
 * Normalise the worker's facet distribution into `{ facet: { value: count } }`.
 * The search-proxy emits each facet as an ordered ARRAY (`[{value,count}]`, from
 * its personalized reorderFacets) — older/object-shaped payloads are still
 * accepted. P2-10: never let `undefined`/`null`/empty surface as a bucket label.
 */
function sanitiseFacets(input: unknown): FacetDistribution {
  if (!input || typeof input !== 'object') return {};
  const out: FacetDistribution = {};
  for (const [facet, values] of Object.entries(input as Record<string, unknown>)) {
    out[facet] = {};
    const pairs: Array<[unknown, unknown]> = Array.isArray(values)
      ? values.map((e) => [(e as { value?: unknown })?.value, (e as { count?: unknown })?.count])
      : Object.entries((values as Record<string, unknown>) || {});
    for (const [v, c] of pairs) {
      if (v == null) continue;
      const label = String(v);
      const key = FORBIDDEN_FACET_KEYS.has(label) ? 'Other' : label;
      const n = typeof c === 'number' ? c : Number(c) || 0;
      out[facet][key] = (out[facet][key] || 0) + n;
    }
  }
  return out;
}

/**
 * Worker hits carry transport-shaped fields (`start_date` as epoch seconds or
 * ISO, `city`/`country`, `image_url`) that the UI reads under different names
 * (`date`, `location`, `imageUrl`). Normalise so cards render dates/locations
 * — without this, same-titled events (e.g. recurring rides) look like dupes.
 */
function coerceDate(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return new Date(v * 1000).toISOString();
  if (typeof v === 'string') {
    return /^\d{10}$/.test(v) ? new Date(Number(v) * 1000).toISOString() : v;
  }
  return undefined;
}

function normaliseHit(h: SearchResult): SearchResult {
  const r = h as SearchResult & {
    start_date?: unknown;
    image_url?: string;
    optimized_url?: string;
    thumbnail_url?: string;
    city?: string;
    country?: string;
    slug?: string;
    price_min?: unknown;
  };
  // Prefer the R2-mirrored optimized/thumbnail copy (always reachable) over the
  // raw external image_url, which often hotlink-fails or gets ORB-blocked.
  const resolvedImage =
    resolveImageUrl({
      imageUrl: r.imageUrl ?? r.image_url ?? null,
      optimizedUrl: r.optimized_url ?? null,
      thumbnailUrl: r.thumbnail_url ?? null,
    }) ?? undefined;
  return {
    ...h,
    date: r.date ?? coerceDate(r.start_date),
    location: r.location ?? ([r.city, r.country].filter(Boolean).join(', ') || undefined),
    imageUrl: resolvedImage,
    slug: r.slug,
    // Marketplace docs carry price_min/max; the result card reads `price`.
    price:
      r.price ??
      (typeof r.price_min === 'number' && r.price_min > 0
        ? Math.round(r.price_min * 100) / 100
        : undefined),
  };
}

/**
 * P0-1 / P1-5 / P0-3: post-process worker hits before they reach the UI.
 * - Drop hits without a displayable title (worker has a defence-in-depth
 *   guard but stale Meili docs may still slip through during reindex).
 * - Dedupe by `objectID` so the same record can never render twice.
 * - When categories are active, drop hits whose category doesn't match.
 */
export function sanitiseHits(
  hits: SearchResult[] | undefined,
  filters: SearchFilters,
): SearchResult[] {
  if (!hits || hits.length === 0) return [];
  const seen = new Set<string>();
  const activeCategories = filters.categories?.length
    ? new Set(filters.categories.map((c) => c.toLowerCase()))
    : null;
  const out: SearchResult[] = [];
  for (const h of hits) {
    if (!h) continue;
    const title = (h.title ?? '').trim();
    if (!title) continue;
    const id = h.objectID || (h as unknown as { id?: string }).id;
    if (!id || seen.has(String(id))) continue;
    if (activeCategories) {
      const cat = (h.category ?? '').toLowerCase();
      if (!cat || !activeCategories.has(cat)) continue;
    }
    seen.add(String(id));
    out.push(normaliseHit(h));
  }
  return out;
}

/**
 * Identity passed by logged-in callers so the worker personalizes ranking from
 * the user's profile (interests/home_city → rank.ts boosts, `_boostReason`).
 * Anonymous callers omit it; the worker falls back to session bias. Passed in
 * (not read from useAuth here) so the hook stays context-free and testable.
 */
export interface SearchIdentity {
  userId?: string | null;
  sessionId?: string | null;
}

interface SearchPage {
  results: SearchResult[];
  suggestions: SearchResult[];
  facets: FacetDistribution;
  facetsPending: boolean;
  totalHits: number;
}

const EMPTY_RESULTS: SearchResult[] = [];
const EMPTY_FACETS: FacetDistribution = {};

/**
 * Search request as a TanStack query keyed on everything that shapes it, so
 * the newest request wins: the old effect had no cancellation, and a slow
 * response for an earlier query/page could overwrite a newer one.
 */
export const useSearch = (
  query: string,
  filters: SearchFilters = {},
  page = 0,
  sort?: string,
  identity: SearchIdentity = {},
  /** `enabled: false` sends nothing (the /search overview fetches grouped instead). */
  options: { enabled?: boolean } = {},
) => {
  const debouncedQuery = useDebounce(query, 300);
  const filtersKey = JSON.stringify(filters);
  const { userId = null, sessionId = null } = identity;

  // Allow a filter-only browse (empty query + active filters); only skip a
  // genuinely empty, unfiltered request or a 1-char mid-typing artefact.
  const trimmedLen = query.trim().length;
  const browseable = hasBrowseFilters(filters);
  const searchable = trimmedLen >= MIN_QUERY_LEN || browseable;
  const waiting = searchable && query !== debouncedQuery && options.enabled !== false;
  const enabled = searchable && !waiting && options.enabled !== false;
  const tooShort = !searchable && trimmedLen > 0;

  const queryKey = ['search', debouncedQuery, filtersKey, page, sort ?? null, userId, sessionId];
  const requestBody = {
    query: debouncedQuery,
    filters: toWorkerFilters(filters, sort),
    hitsPerPage: 20,
    page,
    ...(userId ? { user_id: userId } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
  };
  const q = useQuery<SearchPage>({
    queryKey,
    enabled,
    retry: false, // searchFetch already retries a timeout once
    queryFn: async ({ signal }) => {
      const data = await searchFetch<SearchResponse>('/', requestBody, {
        signal,
        countKey: searchCountKey(requestBody.query, requestBody.filters),
      }).catch((err: unknown) => {
        if (!signal.aborted) console.error('Search error:', err);
        throw err;
      });
      const results = sanitiseHits(data?.hits, filters);
      // P0-1: report the post-filter count so totals don't include hits we
      // just dropped.
      const reportedTotal = data?.totalHits ?? data?.hits?.length ?? 0;
      const dropped = (data?.hits?.length ?? 0) - results.length;
      return {
        results,
        suggestions: sanitiseHits(data?.suggestions, {}),
        facets: sanitiseFacets(data?.facetDistribution),
        facetsPending: data?.facetsPending === true,
        totalHits: Math.max(results.length, reportedTotal - dropped),
      };
    },
  });

  // The worker does not hold the results for the facet counts: when they miss
  // its grace window it answers with facetsPending and finishes them into a
  // short-lived cache. Fetch them separately so the results are not re-requested
  // (and cannot reorder under the reader) just to fill the filter panel.
  const facetsQ = useQuery<FacetDistribution>({
    queryKey: [...queryKey, 'facets'],
    enabled: enabled && q.data?.facetsPending === true,
    retry: false,
    queryFn: async ({ signal }) => {
      const data = await searchFetch<SearchResponse>(
        '/',
        { ...requestBody, facetsOnly: true },
        { signal },
      );
      return sanitiseFacets(data?.facetDistribution);
    },
  });

  const loading = waiting || (enabled && q.isFetching);
  const err = enabled ? q.error : null;
  let error: string | null = null;
  let errorKind: SearchErrorKind = null;
  if (err) {
    if (!isSearchUnavailable(err) && err instanceof SearchFetchException) {
      error = err.message;
      errorKind = 'client_error';
    } else {
      error = SEARCH_UNAVAILABLE_MESSAGE;
      errorKind = 'unavailable';
    }
  }
  const data = enabled && !err ? q.data : undefined;

  return {
    results: data?.results ?? EMPTY_RESULTS,
    suggestions: data?.suggestions ?? EMPTY_RESULTS,
    facets: (data?.facetsPending ? facetsQ.data : data?.facets) ?? EMPTY_FACETS,
    totalHits: data?.totalHits ?? 0,
    loading,
    loadingTimedOut: useLoadingTimedOut(loading, hashKey(queryKey), 15000),
    error,
    errorKind,
    tooShort,
    refetch: q.refetch,
    // Includes all inputs except page so pages from different searches never mix.
    resultsKey: hashKey([query, filtersKey, sort ?? null, userId, sessionId]),
  };
};

export interface SearchGroup {
  /** Postgres entity type, the same id as the scope chips (`venue`, `event`, …). */
  type: string;
  /** Exact count of the type's results: what "See all" shows. */
  total: number;
  hits: SearchResult[];
}

interface GroupedSearchResponse {
  groups?: Array<{ type?: unknown; total?: unknown; hits?: unknown }>;
  totalHits?: number;
  facetDistribution?: FacetDistribution;
  facetsPending?: boolean;
  /** Types whose own call failed in the worker. Their section is missing; it is not empty. */
  groupErrors?: unknown;
  /** Types in mixed-ranking order, failed ones included: where a recovered section belongs. */
  typeOrder?: unknown;
}

interface OverviewPage {
  /** null when the worker answered without `groups` (an older deploy). */
  groups: SearchGroup[] | null;
  facets: FacetDistribution;
  facetsPending: boolean;
  totalHits: number;
  failedTypes: string[];
  typeOrder: string[];
}

const EMPTY_GROUPS: SearchGroup[] = [];
const EMPTY_TYPES: string[] = [];

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];

function parseOverview(data: GroupedSearchResponse, filters: SearchFilters): OverviewPage {
  const groups = Array.isArray(data?.groups)
    ? data.groups.flatMap((g) => {
        if (typeof g?.type !== 'string') return [];
        const hits = sanitiseHits(g.hits as SearchResult[] | undefined, filters);
        if (hits.length === 0) return [];
        const total = typeof g.total === 'number' && g.total >= hits.length ? g.total : hits.length;
        return [{ type: g.type, total, hits }];
      })
    : null;
  return {
    groups,
    facets: sanitiseFacets(data?.facetDistribution),
    facetsPending: data?.facetsPending === true,
    totalHits: data?.totalHits ?? 0,
    failedTypes: stringList(data?.groupErrors),
    typeOrder: stringList(data?.typeOrder),
  };
}

/**
 * Put sections recovered by the retry back where the mixed ranking places
 * them. Sections the ranking does not place keep their order, recovered ones
 * after the original ones. Array.prototype.sort is stable.
 */
export function mergeRecoveredGroups(
  original: SearchGroup[],
  recovered: SearchGroup[],
  typeOrder: string[],
): SearchGroup[] {
  const have = new Set(original.map((g) => g.type));
  const rank = (t: string) => {
    const i = typeOrder.indexOf(t);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...original, ...recovered.filter((g) => !have.has(g.type))].sort(
    // Two unplaced sections compare equal (Infinity - Infinity is NaN).
    (a, b) => (rank(a.type) === rank(b.type) ? 0 : rank(a.type) - rank(b.type)),
  );
}

/**
 * The "All" view of /search: the top hits of each content type, one section
 * per type, ordered by where each type's first hit falls in the mixed ranking
 * (workers/search-proxy/src/grouping.ts). One request: the worker runs the
 * rewrite and embedding once and fans out per type.
 */
export const useSearchOverview = (
  query: string,
  filters: SearchFilters = {},
  identity: SearchIdentity = {},
  options: { enabled?: boolean; perType?: number } = {},
) => {
  const debouncedQuery = useDebounce(query, 300);
  const filtersKey = JSON.stringify(filters);
  const { userId = null, sessionId = null } = identity;
  const perType = options.perType ?? 4;
  const searchable = query.trim().length >= MIN_QUERY_LEN;
  const waiting = searchable && query !== debouncedQuery && options.enabled !== false;
  const enabled = searchable && !waiting && options.enabled !== false;

  const queryKey = ['search-overview', debouncedQuery, filtersKey, perType, userId, sessionId];
  const requestBody = {
    query: debouncedQuery,
    filters: toWorkerFilters(filters),
    hitsPerPage: 20,
    groupBy: 'type',
    perType,
    ...(userId ? { user_id: userId } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
  };
  const q = useQuery<OverviewPage>({
    queryKey,
    enabled,
    retry: false,
    queryFn: async ({ signal }) => {
      // Same key as the scoped list: "See all" is not a second search.
      const data = await searchFetch<GroupedSearchResponse>('/', requestBody, {
        signal,
        countKey: searchCountKey(requestBody.query, requestBody.filters),
      }).catch((err: unknown) => {
        if (!signal.aborted) console.error('Search overview error:', err);
        throw err;
      });
      return parseOverview(data, filters);
    },
  });

  // A section whose own call failed (a per-type query that timed out on a
  // loaded database) is asked for once more, alone, before the page says it
  // did not load. Only the failed types are re-run: re-running all nine calls
  // would add to the load that caused the failure. Measured on prod
  // 2026-11-27: 1 in 10 browser loads came back with a failed section.
  const firstFailed = q.data?.failedTypes ?? EMPTY_TYPES;
  const retryQ = useQuery<OverviewPage>({
    queryKey: [...queryKey, 'retry', firstFailed],
    enabled: enabled && firstFailed.length > 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const data = await searchFetch<GroupedSearchResponse>(
        '/',
        { ...requestBody, filters: { ...requestBody.filters, types: firstFailed } },
        { signal },
      );
      return parseOverview(data, filters);
    },
  });

  // Same facet follow-up as useSearch. Without groupBy the worker takes its
  // facets-only path, keyed on the same inputs.
  const facetsQ = useQuery<FacetDistribution>({
    queryKey: [...queryKey, 'facets'],
    enabled: enabled && q.data?.facetsPending === true,
    retry: false,
    queryFn: async ({ signal }) => {
      const { groupBy: _g, perType: _p, ...flat } = requestBody;
      const data = await searchFetch<SearchResponse>(
        '/',
        { ...flat, page: 0, facetsOnly: true },
        { signal },
      );
      return sanitiseFacets(data?.facetDistribution);
    },
  });

  const loading = waiting || (enabled && q.isFetching);
  const err = enabled ? q.error : null;
  let error: string | null = null;
  let errorKind: SearchErrorKind = null;
  if (err) {
    if (!isSearchUnavailable(err) && err instanceof SearchFetchException) {
      error = err.message;
      errorKind = 'client_error';
    } else {
      error = SEARCH_UNAVAILABLE_MESSAGE;
      errorKind = 'unavailable';
    }
  }
  const data = enabled && !err ? q.data : undefined;
  const retrying = !!data && data.failedTypes.length > 0 && retryQ.isFetching;
  const recovered = data && data.failedTypes.length > 0 && !retrying ? retryQ.data : undefined;
  const groups = useMemo(
    () =>
      data?.groups && recovered?.groups?.length
        ? mergeRecoveredGroups(data.groups, recovered.groups, data.typeOrder)
        : (data?.groups ?? EMPTY_GROUPS),
    [data, recovered],
  );
  // Still unknown: failed and not (yet) recovered. A failed retry, or one
  // that threw, leaves every originally failed type unknown.
  const failedTypes = useMemo(() => {
    if (!data || data.failedTypes.length === 0) return EMPTY_TYPES;
    if (retrying) return EMPTY_TYPES;
    if (!recovered) return data.failedTypes;
    const back = new Set((recovered.groups ?? []).map((g) => g.type));
    // A type the retry answered without a group is genuinely empty.
    const empty = data.failedTypes.filter(
      (t) => !back.has(t) && !recovered.failedTypes.includes(t),
    );
    return data.failedTypes.filter((t) => !back.has(t) && !empty.includes(t));
  }, [data, recovered, retrying]);
  return {
    groups,
    /** False when the worker did not answer in grouped form: fall back to the flat list. */
    supported: data ? data.groups !== null : true,
    facets: (data?.facetsPending ? facetsQ.data : data?.facets) ?? EMPTY_FACETS,
    totalHits: data?.totalHits ?? 0,
    /**
     * Types the worker could not search this time. Their count is unknown,
     * not zero: never show them as empty.
     */
    failedTypes,
    /** Types being asked for again. Their count is unknown too; no notice yet. */
    pendingTypes: retrying ? data.failedTypes : EMPTY_TYPES,
    // Nothing loaded yet with a retry in flight is still loading, not "no
    // results": every section can fail at once on a cold database.
    loading: loading || (retrying && groups.length === 0),
    error,
    errorKind,
    refetch: q.refetch,
  };
};

// Re-export the type-resolver here so consumers that already import from this
// module don't need a second import to filter result rows.
export { resolveType };
