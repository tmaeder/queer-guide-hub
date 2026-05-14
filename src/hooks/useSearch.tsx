import { useState, useEffect, useRef } from "react";
import { useDebounce } from "./useDebounce";
import {
  searchFetch,
  SearchFetchException,
  SEARCH_UNAVAILABLE_MESSAGE,
  isSearchUnavailable,
} from "@/lib/searchFetch";
import { resolveType, toIndexKeys } from "@/lib/searchTaxonomy";

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
  metadata?: Record<string, unknown>;
  _highlightResult?: Record<string, unknown>;
}

export interface SearchFilters {
  types?: string[];
  location?: string;
  categories?: string[];
  /** Topic-cluster UUIDs (#171 / #225). Meili `cluster_ids` filterable. */
  cluster_ids?: string[];
  priceRange?: [number, number];
  dateRange?: [Date, Date];
  rating?: number;
  featured?: boolean;
  verified?: boolean;
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

/** P2-10: never let `undefined`/`null`/empty surface as a facet bucket label. */
function sanitiseFacets(input: FacetDistribution | undefined): FacetDistribution {
  if (!input) return {};
  const out: FacetDistribution = {};
  for (const [facet, values] of Object.entries(input)) {
    out[facet] = {};
    for (const [v, c] of Object.entries(values || {})) {
      const key = FORBIDDEN_FACET_KEYS.has(v) ? 'Other' : v;
      out[facet][key] = (out[facet][key] || 0) + c;
    }
  }
  return out;
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
    out.push(h);
  }
  return out;
}

export const useSearch = (query: string, filters: SearchFilters = {}, page = 1) => {
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
      const requestFilters = { ...filtersRef.current };
      // P0-3: send worker the canonical indexKey, not the UI id.
      if (requestFilters.types?.length) {
        const mapped = toIndexKeys(requestFilters.types);
        requestFilters.types = mapped.length ? mapped : undefined;
      }

      const data = await searchFetch<SearchResponse>('/', {
        query: searchQuery,
        filters: requestFilters,
        hitsPerPage: 20,
        page: searchPage,
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
      performSearch(debouncedQuery, page);
    } else {
      setResults([]);
      setSuggestions([]);
      setFacets({});
      setTotalHits(0);
      setTooShort(false);
    }

  }, [debouncedQuery, filtersKey, page]);

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
