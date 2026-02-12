import { useState, useEffect } from "react";
import { useDebounce } from "./useDebounce";
import { supabase } from "@/integrations/supabase/client";

export interface AlgoliaSearchResult {
  objectID: string;
  title: string;
  description?: string;
  type: 'venue' | 'event' | 'user' | 'news' | 'marketplace' | 'location' | 'content' | 'ressource' | 'personality' | 'travel' | 'tag' | 'group';
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
      const { data, error } = await supabase.functions.invoke('algolia-search', {
        body: {
          query: searchQuery,
          filters,
          hitsPerPage: 20,
        },
      });

      if (error) {
        throw error;
      }

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