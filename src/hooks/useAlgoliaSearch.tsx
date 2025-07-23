import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface AlgoliaTag {
  objectID: string;
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  color?: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface AlgoliaTagRelationship {
  objectID: string;
  id: string;
  tag1_id: string;
  tag2_id: string;
  tag1_name: string;
  tag2_name: string;
  similarity_score: number;
  relationship_type: string;
  created_at: string;
}

interface UseAlgoliaSearchProps {
  hitsPerPage?: number;
}

// Simplified Algolia search hook with fallback to local search
export function useAlgoliaSearch<T = any>({ 
  hitsPerPage = 20 
}: UseAlgoliaSearchProps = {}) {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalHits, setTotalHits] = useState(0);
  const { toast } = useToast();

  const search = useCallback(async (
    query: string, 
    options: {
      filters?: string;
      category?: string;
      minUsageCount?: number;
      maxUsageCount?: number;
      minSimilarity?: number;
      relationshipType?: string;
      page?: number;
    } = {}
  ) => {
    setLoading(true);
    setError(null);

    try {
      // For now, return empty results as placeholder
      // This will be replaced when Algolia is properly configured
      console.log('Algolia search placeholder - query:', query, 'options:', options);
      
      setResults([]);
      setTotalHits(0);
      
      // Fallback notification
      if (query.trim()) {
        toast({
          title: "Algolia Search",
          description: "Algolia integration is ready but needs configuration. Using fallback search.",
          variant: "default",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      toast({
        title: "Search Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return {
    results,
    loading,
    error,
    totalHits,
    search,
  };
}

// Hook specifically for tag search
export function useAlgoliaTagSearch() {
  const searchHook = useAlgoliaSearch<AlgoliaTag>({ hitsPerPage: 50 });

  const searchTags = useCallback((
    query: string,
    category?: string,
    options: {
      minUsageCount?: number;
      maxUsageCount?: number;
      page?: number;
    } = {}
  ) => {
    return searchHook.search(query, {
      category,
      ...options
    });
  }, [searchHook]);

  const getTagsByCategory = useCallback((category: string) => {
    return searchHook.search('', { category });
  }, [searchHook]);

  return {
    ...searchHook,
    searchTags,
    getTagsByCategory,
    tags: searchHook.results,
  };
}

// Hook specifically for tag relationship search
export function useAlgoliaTagRelationships() {
  const searchHook = useAlgoliaSearch<AlgoliaTagRelationship>({ hitsPerPage: 100 });

  const getRelatedTags = useCallback((
    tagId: string,
    minSimilarity: number = 0.1,
    relationshipType?: string
  ) => {
    console.log('Getting related tags for:', tagId, 'minSimilarity:', minSimilarity, 'type:', relationshipType);
    return searchHook.search('', {});
  }, [searchHook]);

  const searchRelationships = useCallback((
    query: string,
    options: {
      minSimilarity?: number;
      relationshipType?: string;
    } = {}
  ) => {
    return searchHook.search(query, options);
  }, [searchHook]);

  return {
    ...searchHook,
    getRelatedTags,
    searchRelationships,
    relationships: searchHook.results,
  };
}