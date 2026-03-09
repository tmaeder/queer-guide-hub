import { useState, useEffect, useRef } from "react";
import { useDebounce } from "./useDebounce";
import { api } from "@/integrations/api/client";
import { invokeWithRetry } from '@/utils/fetchWithRetry';

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
  metadata?: Record<string, any>;
  _highlightResult?: any;
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

export const useSearch = (query: string, filters: SearchFilters = {}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
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

  // Stable serialization of filters to avoid re-firing on every render
  const filtersKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filtersKey]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSuggestions([]);
      return;
    }

    setLoading(true);
    setLoadingTimedOut(false);
    try {
      const { data, error } = await invokeWithRetry('search', {
        body: {
          query: searchQuery,
          filters: filtersRef.current,
          hitsPerPage: 20,
        },
      });

      if (error) {
        throw error;
      }

      setResults(data?.hits || []);
      setSuggestions(data?.suggestions || []);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setSuggestions([]);
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
    }
  }, [debouncedQuery, filtersKey]);

  return {
    results,
    suggestions,
    loading,
    loadingTimedOut,
    performSearch,
  };
};
