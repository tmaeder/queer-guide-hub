import { useState, useEffect, useRef } from "react";
import { useDebounce } from "./useDebounce";
import {
  searchFetch,
  SearchFetchException,
  SEARCH_UNAVAILABLE_MESSAGE,
  isSearchUnavailable,
} from "@/lib/searchFetch";
import { resolveType } from "@/lib/searchTaxonomy";
import { resolveImageUrl } from "@/utils/resolveImageUrl";

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
  /** Topic-cluster UUIDs (#171 / #225). Meili `cluster_ids` filterable. */
  cluster_ids?: string[];
  /** Audience tags (lesbian, trans, …) — search_hybrid any-of facet match. */
  target_groups?: string[];
  /** Content tags (leather, gay-bar, …) — search_hybrid any-of facet match. */
  tags?: string[];
  priceRange?: [number, number];
  dateRange?: [Date, Date];
  rating?: number;
  featured?: boolean;
  /** Free-entry only (events/marketplace) → worker is_free. */
  free?: boolean;
  verified?: boolean;
  /** Geo radius — worker turns these into Meili _geoRadius(lat,lng,m). */
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
export function toWorkerFilters(
  filters: SearchFilters,
  sort?: string,
): Record<string, unknown> {
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
  totalHits?: number;
  page?: number;
  hitsPerPage?: number;
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
      ? values.map((e) => [
          (e as { value?: unknown })?.value,
          (e as { count?: unknown })?.count,
        ])
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

export const useSearch = (
  query: string,
  filters: SearchFilters = {},
  page = 1,
  sort?: string,
  identity: SearchIdentity = {},
) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<FacetDistribution>({});
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<SearchErrorKind>(null);
  const [totalHits, setTotalHits] = useState(0);
  const [tooShort, setTooShort] = useState(false);

  useEffect(() => {
    if (!loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  const debouncedQuery = useDebounce(query, 300);

  const filtersKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const sortRef = useRef(sort);
  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);

  const { userId, sessionId } = identity;
  const identityRef = useRef(identity);
  useEffect(() => {
    identityRef.current = { userId, sessionId };
  }, [userId, sessionId]);

  const performSearch = async (searchQuery: string, searchPage = 1) => {
    if (searchQuery.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      setSuggestions([]);
      setFacets({});
      setTotalHits(0);
      setError(null);
      setErrorKind(null);
      setTooShort(searchQuery.trim().length > 0);
      return;
    }
    setTooShort(false);

    setLoading(true);
    setLoadingTimedOut(false);
    setError(null);
    setErrorKind(null);
    try {
      const { userId: uid, sessionId: sid } = identityRef.current;
      const data = await searchFetch<SearchResponse>('/', {
        query: searchQuery,
        filters: toWorkerFilters(filtersRef.current, sortRef.current),
        hitsPerPage: 20,
        page: searchPage,
        ...(uid ? { user_id: uid } : {}),
        ...(sid ? { session_id: sid } : {}),
      });

      const cleaned = sanitiseHits(data?.hits, filtersRef.current);
      setResults(cleaned);
      setSuggestions(sanitiseHits(data?.suggestions, {}));
      setFacets(sanitiseFacets(data?.facetDistribution));
      // P0-1: report the post-filter count to the UI so totals don't include
      // hits we just dropped.
      const reportedTotal = data?.totalHits ?? data?.hits?.length ?? 0;
      const dropped = (data?.hits?.length ?? 0) - cleaned.length;
      setTotalHits(Math.max(cleaned.length, reportedTotal - dropped));
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
      setSuggestions([]);
      setFacets({});
      setTotalHits(0);
      if (isSearchUnavailable(err)) {
        setError(SEARCH_UNAVAILABLE_MESSAGE);
        setErrorKind('unavailable');
      } else if (err instanceof SearchFetchException) {
        setError(err.message);
        setErrorKind('client_error');
      } else {
        setError(SEARCH_UNAVAILABLE_MESSAGE);
        setErrorKind('unavailable');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debouncedQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      performSearch(debouncedQuery, page);
    } else {
      setResults([]);
      setSuggestions([]);
      setFacets({});
      setTotalHits(0);
      setTooShort(false);
    }

  }, [debouncedQuery, filtersKey, page, sort, userId, sessionId]);

  return {
    results,
    suggestions,
    facets,
    totalHits,
    loading,
    loadingTimedOut,
    error,
    errorKind,
    tooShort,
    performSearch,
  };
};

// Re-export the type-resolver here so consumers that already import from this
// module don't need a second import to filter result rows.
export { resolveType };
