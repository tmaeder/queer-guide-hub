import { useState, useEffect, useRef } from "react";
import { useDebounce } from "./useDebounce";

const SEARCH_PROXY_URL = import.meta.env.VITE_SEARCH_PROXY_URL || 'https://queer-guide-search-proxy.maeder-tobiassimon.workers.dev';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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
  priceRange?: [number, number];
  dateRange?: [Date, Date];
  rating?: number;
  featured?: boolean;
  verified?: boolean;
}

export interface FacetDistribution {
  [facet: string]: Record<string, number>;
}

async function searchWithRetry(body: Record<string, unknown>): Promise<any> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(SEARCH_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

export const useSearch = (query: string, filters: SearchFilters = {}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<FacetDistribution>({});
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

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

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSuggestions([]);
      setFacets({});
      return;
    }

    setLoading(true);
    setLoadingTimedOut(false);
    try {
      const data = await searchWithRetry({
        query: searchQuery,
        filters: filtersRef.current,
        hitsPerPage: 20,
      });

      setResults(data?.hits || []);
      setSuggestions(data?.suggestions || []);
      setFacets(data?.facetDistribution || {});
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setSuggestions([]);
      setFacets({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery);
    } else {
      setResults([]);
      setSuggestions([]);
      setFacets({});
    }
  }, [debouncedQuery, filtersKey]);

  return {
    results,
    suggestions,
    facets,
    loading,
    loadingTimedOut,
    performSearch,
  };
};
