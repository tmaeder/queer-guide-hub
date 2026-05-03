import { useState, useEffect, useRef } from "react";
import { useDebounce } from "./useDebounce";
import {
  searchFetch,
  SearchFetchException,
  SEARCH_UNAVAILABLE_MESSAGE,
  isSearchUnavailable,
} from "@/lib/searchFetch";

// Mirror the worker's MIN_QUERY_LEN — anything shorter is rejected server-side
// with 400, so we short-circuit it client-side too (bug #8).
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

export const useSearch = (query: string, filters: SearchFilters = {}, page = 0) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<FacetDistribution>({});
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<SearchErrorKind>(null);
  const [totalHits, setTotalHits] = useState(0);

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

  const performSearch = async (searchQuery: string, searchPage = 0) => {
    if (searchQuery.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      setSuggestions([]);
      setFacets({});
      setError(null);
      setErrorKind(null);
      return;
    }

    setLoading(true);
    setLoadingTimedOut(false);
    setError(null);
    setErrorKind(null);
    try {
      const data = await searchFetch<SearchResponse>('/', {
        query: searchQuery,
        filters: filtersRef.current,
        hitsPerPage: 20,
        page: searchPage,
      });

      setResults(data?.hits || []);
      setSuggestions(data?.suggestions || []);
      setFacets(data?.facetDistribution || {});
      setTotalHits(data?.totalHits ?? data?.hits?.length ?? 0);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    performSearch,
  };
};
