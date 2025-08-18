import { useState, useEffect } from "react";
import { useDebounce } from "./useDebounce";

export interface AlgoliaSearchResult {
  objectID: string;
  title: string;
  description?: string;
  type: 'venue' | 'event' | 'user' | 'news' | 'marketplace' | 'location' | 'content' | 'ressource' | 'personality' | 'travel';
  category?: string;
  location?: string;
  price?: number;
  date?: string;
  rating?: number;
  imageUrl?: string;
  metadata?: Record<string, any>;
  _highlightResult?: any;
}

export interface AlgoliaSearchFilters {
  types?: string[];
  location?: string;
  categories?: string[];
  priceRange?: [number, number];
  dateRange?: [Date, Date];
  rating?: number;
  featured?: boolean;
  verified?: boolean;
}

export const useAlgoliaSearch = (query: string, filters: AlgoliaSearchFilters = {}) => {
  const [results, setResults] = useState<AlgoliaSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AlgoliaSearchResult[]>([]);
  
  const debouncedQuery = useDebounce(query, 300);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/algolia-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          filters,
          hitsPerPage: 20,
        }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setResults(data.hits || []);
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Algolia search error:', error);
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
  }, [debouncedQuery, filters]);

  return {
    results,
    suggestions,
    loading,
    performSearch,
  };
};