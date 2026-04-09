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
  sourceId?: string;
  category?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export const useNews = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 30000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchArticles = useCallback(async (filters?: NewsFilters) => {
    setLoading(true);
    setLoadingTimedOut(false);
    setError(null);

    try {
      // Build the query step by step to avoid TypeScript issues
      const sortField = filters?.sortField || 'published_at';
      const sortOrder = filters?.sortOrder === 'asc';

      let queryBuilder = supabase
        .from('news_articles')
        .select(
          `
          id, slug, title, excerpt, url, image_url, author,
          published_at, source_id, views_count, is_featured,
          country_ids, city_ids, tags, category
        `,
        )
        .not('published_at', 'is', null)
        .order(sortField, { ascending: sortOrder });

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
        queryBuilder = (queryBuilder as any).or(
          `title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`,
        );
      }

      // Apply source filtering if provided
      if (filters?.sourceId) {
        queryBuilder = (queryBuilder as any).eq('source_id', filters.sourceId);
      }

      // Apply category filtering if provided
      if (filters?.category) {
        queryBuilder = (queryBuilder as any).eq('category', filters.category);
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

      // Execute the query directly (no retry wrapper — simpler and more reliable)
      const { data, error: fetchError } = await (queryBuilder as any).limit(200);

      if (fetchError) {
        console.error('Error fetching articles:', fetchError);
        setError('Failed to load articles. Please try again.');
        return;
      }

      if (data) {
        // Deduplicate by URL (same article from different sources)
        const seen = new Set<string>();
        const deduped = data.filter((article: any) => {
          const key = article.url || article.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setArticles(deduped);
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
        article_id: articleId,
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
      const { data, error: fetchError } = await supabase
        .from('news_articles')
        .select(
          `
          id, slug, title, excerpt, url, image_url, author,
          published_at, source_id, views_count, is_featured,
          country_ids, city_ids, tags, category
        `,
        )
        .eq('is_featured', true)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(5);

      if (fetchError) {
        console.warn('Error fetching featured articles:', fetchError);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('Error fetching featured articles:', err);
      return [];
    }
  }, []);

  const getTrendingTags = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('unified_tags')
        .select('name, color, usage_count')
        .gt('usage_count', 0)
        .order('usage_count', { ascending: false })
        .limit(12);

      if (fetchError) {
        console.warn('Error fetching trending tags:', fetchError);
        return [];
      }

      return (
        data?.map((item: any) => ({
          tag: item.name,
          count: item.usage_count || 0,
        })) || []
      );
    } catch (err) {
      console.warn('Error fetching trending tags:', err);
      return [];
    }
  }, []);

  const refreshData = useCallback(async () => {
    await Promise.allSettled([fetchArticles(), fetchSources()]);
  }, [fetchArticles, fetchSources]);

  // Initialize on mount — fetchArticles/fetchSources have [] deps so are stable

  useEffect(() => {
    Promise.all([fetchArticles(), fetchSources()]);
  }, []);

  return {
    articles,
    sources,
    loading,
    loadingTimedOut,
    error,
    fetchArticles,
    incrementViews,
    getFeaturedArticles,
    getTrendingTags,
    refreshData,
  };
};
