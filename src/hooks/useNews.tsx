import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Simplified type definitions to avoid TypeScript recursion issues
type NewsArticle = any;
type NewsCategory = any;
type NewsSource = any;

interface NewsFilters {
  tags?: string[];
  dateRange?: {
    from?: string;
    to?: string;
  };
  search?: string;
  featured?: boolean;
  location?: {
    country_id?: string;
    city_id?: string;
    query?: string;
  };
  countryIds?: string[];
  cityIds?: string[];
}

export const useNews = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async (filters?: NewsFilters) => {
    setLoading(true);
    setError(null);
    
    try {
      // Build the query step by step to avoid TypeScript issues
      let queryBuilder = supabase
        .from('news_articles')
        .select(`
          *,
          news_sources (
            id,
            name,
            url,
            is_active
          )
        `)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false });

      // Apply city filtering if provided
      if (filters?.cityIds && filters.cityIds.length > 0) {
        queryBuilder = (queryBuilder as any).in('city_id', filters.cityIds);
      }

      // Apply country filtering if provided  
      if (filters?.countryIds && filters.countryIds.length > 0) {
        queryBuilder = (queryBuilder as any).in('country_id', filters.countryIds);
      }

      // Apply location filtering if provided
      if (filters?.location?.city_id) {
        queryBuilder = (queryBuilder as any).eq('city_id', filters.location.city_id);
      }

      if (filters?.location?.country_id) {
        queryBuilder = (queryBuilder as any).eq('country_id', filters.location.country_id);
      }

      // Apply search filtering if provided
      if (filters?.search) {
        queryBuilder = (queryBuilder as any).or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
      }

      // Apply featured filtering if provided
      if (filters?.featured !== undefined) {
        queryBuilder = (queryBuilder as any).eq('is_featured', filters.featured);
      }

      // Apply date range filtering if provided
      if (filters?.dateRange?.from) {
        queryBuilder = (queryBuilder as any).gte('published_at', filters.dateRange.from);
      }

      if (filters?.dateRange?.to) {
        queryBuilder = (queryBuilder as any).lte('published_at', filters.dateRange.to);
      }

      // Apply tags filtering if provided
      if (filters?.tags && filters.tags.length > 0) {
        queryBuilder = (queryBuilder as any).overlaps('tags', filters.tags);
      }

      // Execute the query
      const { data, error: fetchError } = await (queryBuilder as any).limit(50);

      if (fetchError) {
        console.error('Error fetching articles:', fetchError);
        setError('Failed to load articles. Please try again.');
        return;
      }

      if (data) {
        setArticles(data);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);


  const fetchSources = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('news_sources')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (fetchError) {
        console.warn('Error fetching sources:', fetchError);
        return;
      }

      if (data) {
        setSources(data);
      }
    } catch (err) {
      console.warn('Unexpected error fetching sources:', err);
    }
  }, []);

  const incrementViews = useCallback(async (articleId: string) => {
    try {
      const { error } = await supabase.rpc('increment_article_views', {
        article_id: articleId
      });

      if (error) {
        console.warn('Error incrementing views:', error);
      }
    } catch (err) {
      console.warn('Error incrementing views:', err);
    }
  }, []);

  const getFeaturedArticles = useCallback(async () => {
    try {
      return [];
    } catch (err) {
      console.warn('Error fetching featured articles:', err);
      return [];
    }
  }, []);

  const getTrendingTags = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('unified_tag_assignments')
        .select(`
          unified_tags!inner(
            name,
            color,
            usage_count
          )
        `)
        .eq('entity_type', 'news')
        .order('unified_tags(usage_count)', { ascending: false })
        .limit(10);

      if (fetchError) {
        console.warn('Error fetching trending tags:', fetchError);
        return [];
      }

      return data?.map((item: any) => ({
        tag: item.unified_tags.name,
        count: item.unified_tags.usage_count || 0
      })) || [];
    } catch (err) {
      console.warn('Error fetching trending tags:', err);
      return [];
    }
  }, []);

  const refreshData = useCallback(async () => {
    await Promise.allSettled([
      fetchArticles(),
      fetchSources()
    ]);
  }, [fetchArticles, fetchSources]);

  useEffect(() => {
    const initializeData = async () => {
      await fetchSources();
    };

    initializeData();
  }, [fetchSources]);

  return {
    articles,
    sources,
    loading,
    error,
    fetchArticles,
    incrementViews,
    getFeaturedArticles,
    getTrendingTags,
    refreshData
  };
};