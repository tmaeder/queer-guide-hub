import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type NewsArticle = Tables<'news_articles'> & {
  news_sources: Tables<'news_sources'>;
  countries?: Tables<'countries'>[];
  cities?: Tables<'cities'>[];
};

type NewsCategory = Tables<'news_categories'>;
type NewsSource = Tables<'news_sources'>;

interface NewsFilters {
  category?: string;
  tags?: string[];
  countryIds?: string[];
  cityIds?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  sentiment?: string;
  search?: string;
}

export const useNews = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = async (filters?: NewsFilters) => {
    try {
      setLoading(true);
      let query = supabase
        .from('news_articles')
        .select(`
          *,
          news_sources (*)
        `)
        .order('published_at', { ascending: false });

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%,excerpt.ilike.%${filters.search}%`);
      }

      if (filters?.sentiment) {
        query = query.eq('sentiment', filters.sentiment);
      }

      if (filters?.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      if (filters?.countryIds && filters.countryIds.length > 0) {
        query = query.overlaps('country_ids', filters.countryIds);
      }

      if (filters?.cityIds && filters.cityIds.length > 0) {
        query = query.overlaps('city_ids', filters.cityIds);
      }

      if (filters?.dateRange) {
        query = query
          .gte('published_at', filters.dateRange.start.toISOString())
          .lte('published_at', filters.dateRange.end.toISOString());
      }

      const { data, error: fetchError } = await query.limit(50);

      if (fetchError) {
        throw fetchError;
      }

      setArticles(data || []);
    } catch (err) {
      console.error('Error fetching articles:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch articles');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('news_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      setCategories(data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    }
  };

  const fetchSources = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('news_sources')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      setSources(data || []);
    } catch (err) {
      console.error('Error fetching sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sources');
    }
  };

  const incrementViews = async (articleId: string) => {
    try {
      const { error: incrementError } = await supabase.rpc('increment_article_views', {
        article_id: articleId
      });

      if (incrementError) {
        console.error('Error incrementing views:', incrementError);
      }
    } catch (err) {
      console.error('Error incrementing views:', err);
    }
  };

  const getFeaturedArticles = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('news_articles')
        .select(`
          *,
          news_sources (*)
        `)
        .eq('is_featured', true)
        .order('published_at', { ascending: false })
        .limit(5);

      if (fetchError) {
        throw fetchError;
      }

      return data || [];
    } catch (err) {
      console.error('Error fetching featured articles:', err);
      return [];
    }
  };

  const getTrendingTags = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('news_articles')
        .select('tags')
        .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (fetchError) {
        throw fetchError;
      }

      const tagCounts: Record<string, number> = {};
      data?.forEach(article => {
        article.tags?.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });

      return Object.entries(tagCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([tag, count]) => ({ tag, count }));
    } catch (err) {
      console.error('Error fetching trending tags:', err);
      return [];
    }
  };

  useEffect(() => {
    fetchArticles();
    fetchCategories();
    fetchSources();
  }, []);

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
    refreshData: () => {
      fetchArticles();
      fetchCategories();
      fetchSources();
    }
  };
};