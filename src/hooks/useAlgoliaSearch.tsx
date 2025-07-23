import { useState, useCallback, useMemo } from 'react';
import { searchClient, ALGOLIA_INDEXES } from '@/integrations/algolia/client';
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
  index: string;
  hitsPerPage?: number;
}

export function useAlgoliaSearch<T = any>({ 
  index, 
  hitsPerPage = 20 
}: UseAlgoliaSearchProps) {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalHits, setTotalHits] = useState(0);
  const { toast } = useToast();

  const algoliaIndex = useMemo(() => searchClient.initIndex(index), [index]);

  const search = useCallback(async (
    query: string, 
    options: {
      filters?: string;
      facetFilters?: string[][];
      numericFilters?: string[];
      attributesToRetrieve?: string[];
      page?: number;
    } = {}
  ) => {
    setLoading(true);
    setError(null);

    try {
      const searchParams = {
        query,
        hitsPerPage,
        page: options.page || 0,
        filters: options.filters,
        facetFilters: options.facetFilters,
        numericFilters: options.numericFilters,
        attributesToRetrieve: options.attributesToRetrieve,
      };

      const response = await algoliaIndex.search(searchParams);
      
      setResults(response.hits as T[]);
      setTotalHits(response.nbHits);
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
  }, [algoliaIndex, hitsPerPage, toast]);

  const searchByFacets = useCallback(async (
    facetName: string,
    facetQuery: string = '',
    maxFacetHits: number = 20
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await algoliaIndex.searchForFacetValues(
        facetName,
        facetQuery,
        maxFacetHits
      );
      
      return response.facetHits;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Facet search failed';
      setError(errorMessage);
      toast({
        title: "Facet Search Error",
        description: errorMessage,
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [algoliaIndex, toast]);

  return {
    results,
    loading,
    error,
    totalHits,
    search,
    searchByFacets,
  };
}

// Hook specifically for tag search
export function useAlgoliaTagSearch() {
  const searchHook = useAlgoliaSearch<AlgoliaTag>({ 
    index: ALGOLIA_INDEXES.TAGS,
    hitsPerPage: 50
  });

  const searchTags = useCallback((
    query: string,
    category?: string,
    options: {
      minUsageCount?: number;
      maxUsageCount?: number;
      page?: number;
    } = {}
  ) => {
    const filters: string[] = [];
    const numericFilters: string[] = [];

    if (category && category !== 'all') {
      filters.push(`category:${category}`);
    }

    if (options.minUsageCount !== undefined) {
      numericFilters.push(`usage_count >= ${options.minUsageCount}`);
    }

    if (options.maxUsageCount !== undefined) {
      numericFilters.push(`usage_count <= ${options.maxUsageCount}`);
    }

    return searchHook.search(query, {
      filters: filters.join(' AND '),
      numericFilters: numericFilters.length > 0 ? numericFilters : undefined,
      page: options.page,
    });
  }, [searchHook]);

  const getTagsByCategory = useCallback((category: string) => {
    return searchHook.searchByFacets('category', category);
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
  const searchHook = useAlgoliaSearch<AlgoliaTagRelationship>({ 
    index: ALGOLIA_INDEXES.TAG_RELATIONSHIPS,
    hitsPerPage: 100
  });

  const getRelatedTags = useCallback((
    tagId: string,
    minSimilarity: number = 0.1,
    relationshipType?: string
  ) => {
    const filters: string[] = [`tag1_id:${tagId} OR tag2_id:${tagId}`];
    const numericFilters: string[] = [`similarity_score >= ${minSimilarity}`];

    if (relationshipType) {
      filters.push(`relationship_type:${relationshipType}`);
    }

    return searchHook.search('', {
      filters: filters.join(' AND '),
      numericFilters,
    });
  }, [searchHook]);

  const searchRelationships = useCallback((
    query: string,
    options: {
      minSimilarity?: number;
      relationshipType?: string;
    } = {}
  ) => {
    const numericFilters: string[] = [];
    const filters: string[] = [];

    if (options.minSimilarity !== undefined) {
      numericFilters.push(`similarity_score >= ${options.minSimilarity}`);
    }

    if (options.relationshipType) {
      filters.push(`relationship_type:${options.relationshipType}`);
    }

    return searchHook.search(query, {
      filters: filters.length > 0 ? filters.join(' AND ') : undefined,
      numericFilters: numericFilters.length > 0 ? numericFilters : undefined,
      attributesToRetrieve: ['tag1_name', 'tag2_name', 'similarity_score', 'relationship_type'],
    });
  }, [searchHook]);

  return {
    ...searchHook,
    getRelatedTags,
    searchRelationships,
    relationships: searchHook.results,
  };
}