import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://xqeacpakadqfxjxjcewc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Simplified type definitions to avoid TypeScript recursion issues
type NewsArticle = any;
type NewsCategory = any;
type NewsSource = any;

interface NewsFilters {
  category?: string;
  tags?: string[];
  dateRange?: {
    from?: string;
    to?: string;
  };
  sentiment?: string;
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
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = useCallback(async (filters?: NewsFilters) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await supabase
        .from('news_articles')
        .select('*')
        .eq('published', true)
        .order('published_at', { ascending: false })
        .limit(50);

      const { data, error: fetchError } = response as { data: any[] | null; error: any };

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

  const fetchCategories = useCallback(async () => {
    try {
      const response = await supabase
        .from('news_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const { data, error: fetchError } = response as { data: any[] | null; error: any };

      if (fetchError) {
        console.warn('Error fetching categories:', fetchError);
        return;
      }

      if (data) {
        setCategories(data);
      }
    } catch (err) {
      console.warn('Unexpected error fetching categories:', err);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    try {
      const response = await supabase
        .from('news_sources')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      const { data, error: fetchError } = response as { data: any[] | null; error: any };

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
      const response = await supabase.rpc('increment_article_views', {
        article_id: articleId
      });

      const { error } = response as { error: any };

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
      const response = await supabase
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

      const { data, error: fetchError } = response as { data: any[] | null; error: any };

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
      fetchCategories(),
      fetchSources()
    ]);
  }, [fetchArticles, fetchCategories, fetchSources]);

  useEffect(() => {
    const initializeData = async () => {
      await Promise.allSettled([
        fetchCategories(),
        fetchSources()
      ]);
    };

    initializeData();
  }, [fetchCategories, fetchSources]);

  return {
    articles,
    categories,
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