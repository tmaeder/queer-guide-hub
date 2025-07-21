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
  dateRange?: string | {
    start: Date;
    end: Date;
  };
  sentiment?: string;
  search?: string;
  nearMe?: boolean;
  userLocation?: { lat: number; lng: number };
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
          news_sources!inner (*)
        `)
        .eq('news_sources.is_active', true)
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
        // Filter by unified tag assignments
        const { data: taggedArticles } = await supabase
          .from('unified_tag_assignments')
          .select('entity_id')
          .eq('entity_type', 'news')
          .in('unified_tags.name', filters.tags);
        
        if (taggedArticles) {
          const articleIds = taggedArticles.map(ta => ta.entity_id);
          query = query.in('id', articleIds);
        }
      }

      if (filters?.countryIds && filters.countryIds.length > 0) {
        query = query.overlaps('country_ids', filters.countryIds);
      }

      if (filters?.cityIds && filters.cityIds.length > 0) {
        query = query.overlaps('city_ids', filters.cityIds);
      }

      if (filters?.dateRange) {
        if (typeof filters.dateRange === 'string') {
          const now = new Date();
          let startDate: Date;

          switch (filters.dateRange) {
            case 'today':
              startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              query = query.gte('published_at', startDate.toISOString());
              break;
            case 'week':
              startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              query = query.gte('published_at', startDate.toISOString());
              break;
            case 'month':
              startDate = new Date(now.getFullYear(), now.getMonth(), 1);
              query = query.gte('published_at', startDate.toISOString());
              break;
            case 'year':
              startDate = new Date(now.getFullYear(), 0, 1);
              query = query.gte('published_at', startDate.toISOString());
              break;
            case '2024':
            case '2023':
            case '2022':
              const year = parseInt(filters.dateRange);
              startDate = new Date(year, 0, 1);
              const endDate = new Date(year + 1, 0, 1);
              query = query
                .gte('published_at', startDate.toISOString())
                .lt('published_at', endDate.toISOString());
              break;
          }
        } else {
          query = query
            .gte('published_at', filters.dateRange.start.toISOString())
            .lte('published_at', filters.dateRange.end.toISOString());
        }
      }

      const { data, error: fetchError } = await query.limit(200);

      if (fetchError) {
        throw fetchError;
      }

      let articlesData = data || [];

      // Filter by location if nearMe is enabled
      if (filters?.nearMe && filters?.userLocation) {
        try {
          const { data: locationData, error: locationError } = await supabase.functions.invoke('mapbox-geocoding', {
            body: { 
              lat: filters.userLocation.lat, 
              lng: filters.userLocation.lng,
              reverse: true
            }
          });

          if (locationError) {
            console.error('Error getting location info:', locationError);
          } else if (locationData) {
            const { city, country } = locationData;
            
            // Filter articles that are relevant to the user's location
            articlesData = articlesData.filter(article => {
              // Check if article mentions the user's city or country in the content/title
              const contentText = `${article.title} ${article.content || ''} ${article.excerpt || ''}`.toLowerCase();
              return contentText.includes(city?.toLowerCase() || '') || 
                     contentText.includes(country?.toLowerCase() || '');
            });
          }
        } catch (err) {
          console.error('Error filtering by location:', err);
        }
      }

      setArticles(articlesData);
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
      // Get trending tags from unified tag assignments for news articles
      const { data, error: fetchError } = await supabase
        .from('unified_tag_assignments')
        .select(`
          unified_tags!inner(name, usage_count),
          entity_type
        `)
        .eq('entity_type', 'news')
        .order('unified_tags.usage_count', { ascending: false })
        .limit(20);

      if (fetchError) {
        throw fetchError;
      }

      // Process the data to get tag counts
      const tagCounts: Record<string, number> = {};
      data?.forEach(assignment => {
        const tag = assignment.unified_tags as any;
        if (tag?.name) {
          tagCounts[tag.name] = tag.usage_count || 0;
        }
      });
      
      return Object.entries(tagCounts)
        .sort(([,a], [,b]) => b - a)
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