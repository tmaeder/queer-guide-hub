import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

type NewsArticle = Record<string, unknown>;
type NewsSource = Record<string, unknown>;

export interface NewsCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

interface NewsFilters {
  tags?: string[];
  dateRange?: {
    from?: string;
    to?: string;
  };
  search?: string;
  featured?: boolean;
  inStory?: boolean;
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
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [articleTags, setArticleTags] = useState<Record<string, string[]>>({});

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
      const sortField = filters?.sortField || 'published_at';
      const sortOrder = filters?.sortOrder === 'asc';

      let queryBuilder = supabase
        .from('news_articles')
        .select(
          `
          id, slug, title, excerpt, url, image_url, author,
          published_at, source_id, views_count, is_featured, is_premium,
          country_ids, city_ids, tags, category, category_canonical, publisher_name
        `,
        )
        .not('published_at', 'is', null)
        .not('content', 'is', null)
        .neq('content', '')
        .or('quality_score.is.null,quality_score.gte.50')
        // Hide articles flagged or rejected by the news quality pipeline.
        // Legacy rows (quality_status NULL) and approved ones (passed) stay visible.
        .or('quality_status.is.null,quality_status.eq.passed')
        // Hide rows that the canonical_url-dedup pass marked as duplicates of
        // an older row (Group A4).
        .is('duplicate_of_id', null)
        .order(sortField, { ascending: sortOrder });

      if (filters?.cityIds && filters.cityIds.length > 0) {
        queryBuilder = (queryBuilder as typeof queryBuilder).in('city_id', filters.cityIds);
      }
      if (filters?.countryIds && filters.countryIds.length > 0) {
        queryBuilder = (queryBuilder as typeof queryBuilder).in('country_id', filters.countryIds);
      }
      if (filters?.location?.city_id) {
        queryBuilder = (queryBuilder as typeof queryBuilder).eq('city_id', filters.location.city_id);
      }
      if (filters?.location?.country_id) {
        queryBuilder = (queryBuilder as typeof queryBuilder).eq('country_id', filters.location.country_id);
      }
      if (filters?.search && filters.search.trim() !== '') {
        const escaped = filters.search.replace(/[%_,]/g, (m) => `\\${m}`);
        queryBuilder = (queryBuilder as typeof queryBuilder).or(
          `title.ilike.%${escaped}%,content.ilike.%${escaped}%`,
        );
      }
      if (filters?.sourceId) {
        queryBuilder = (queryBuilder as typeof queryBuilder).eq('source_id', filters.sourceId);
      }
      if (filters?.category) {
        // Filter on the canonical-category column from migration
        // news_qa_backfill_category_canonical. We OR with the legacy
        // `category` column so any rows the backfill hasn't classified yet
        // (or future legacy categories) still match by name.
        const cat = filters.category.replace(/[(),]/g, '');
        queryBuilder = (queryBuilder as typeof queryBuilder).or(
          `category_canonical.eq.${cat},category.eq.${cat}`,
        );
      }
      if (filters?.featured !== undefined) {
        queryBuilder = (queryBuilder as typeof queryBuilder).eq('is_featured', filters.featured);
      }
      if (filters?.dateRange?.from) {
        queryBuilder = (queryBuilder as typeof queryBuilder).gte('published_at', filters.dateRange.from);
      }
      if (filters?.dateRange?.to) {
        queryBuilder = (queryBuilder as typeof queryBuilder).lte('published_at', filters.dateRange.to);
      }
      if (filters?.tags && filters.tags.length > 0) {
        queryBuilder = (queryBuilder as typeof queryBuilder).overlaps('tags', filters.tags);
      }

      // Restrict to articles that belong to a multi-article story.
      if (filters?.inStory) {
        const { data: storyLinks } = await supabase
          .from('news_story_articles' as never)
          .select('article_id, story_id, news_stories!inner(article_count)') as unknown as {
            data: Array<{ article_id: string; news_stories: { article_count: number } }> | null;
          };
        const eligibleIds = (storyLinks ?? [])
          .filter((l) => l.news_stories?.article_count >= 2)
          .map((l) => l.article_id);
        if (eligibleIds.length === 0) {
          setArticles([]);
          setLoading(false);
          return;
        }
        queryBuilder = (queryBuilder as typeof queryBuilder).in('id', eligibleIds);
      }

      const { data, error: fetchError } = await (queryBuilder as typeof queryBuilder).limit(200);

      if (fetchError) {
        console.error('Error fetching articles:', fetchError);
        setError('Failed to load articles. Please try again.');
        return;
      }

      if (data) {
        const seen = new Set<string>();
        const deduped = data.filter((article: Record<string, unknown>) => {
          const key = article.url || article.id;
          if (seen.has(key as string)) return false;
          seen.add(key as string);
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

  // Batch-fetch tags for all visible articles (replaces per-card queries)
  const fetchTagsForArticles = useCallback(async (articleIds: string[]) => {
    if (articleIds.length === 0) {
      setArticleTags({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from('unified_tag_assignments')
        .select('entity_id, unified_tags!inner(name)')
        .eq('entity_type', 'news')
        .in('entity_id', articleIds);

      if (error) {
        console.warn('Failed to batch-fetch tags:', error);
        return;
      }

      if (data) {
        const tagMap: Record<string, string[]> = {};
        data.forEach((row: { entity_id: string; unified_tags: { name: string } }) => {
          if (!tagMap[row.entity_id]) tagMap[row.entity_id] = [];
          tagMap[row.entity_id].push(row.unified_tags.name);
        });
        setArticleTags(tagMap);
      }
    } catch (err) {
      console.warn('Error batch-fetching tags:', err);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    try {
      // Exclude aggregator providers (NewsAPI, GNews, NewsData, TheNewsAPI) so
      // the Source dropdown only contains real publications.
      // is_aggregator was added in migration news_qa_add_category_canonical_and_aggregator.
      const { data, error: fetchError } = await supabase
        .from('news_sources')
        .select('*')
        .eq('is_active', true)
        .or('is_aggregator.is.null,is_aggregator.eq.false')
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

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('news_categories')
        .select('id, name, slug, description, color, icon, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (fetchError) {
        console.warn('Error fetching categories:', fetchError);
        return;
      }

      if (data) {
        setCategories(data as NewsCategory[]);
      }
    } catch (err) {
      console.warn('Unexpected error fetching categories:', err);
    }
  }, []);

  const incrementViews = useCallback(async (articleId: string) => {
    try {
      const { error } = await supabase.rpc('increment_article_views', {
        article_id: articleId,
      });
      if (error) console.warn('Error incrementing views:', error);
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
          published_at, source_id, views_count, is_featured, is_premium,
          country_ids, city_ids, tags, category, category_canonical, publisher_name
        `,
        )
        .eq('is_featured', true)
        .eq('is_premium', false)
        .not('published_at', 'is', null)
        .not('content', 'is', null)
        .neq('content', '')
        .or('quality_score.is.null,quality_score.gte.50')
        .or('quality_status.is.null,quality_status.eq.passed')
        .is('duplicate_of_id', null)
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
        .select('name, usage_count')
        .gt('usage_count', 0)
        .order('usage_count', { ascending: false })
        .limit(12);

      if (fetchError) {
        console.warn('Error fetching trending tags:', fetchError);
        return [];
      }

      return (
        data?.map((item: { name: string; usage_count: number }) => ({
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
    await Promise.allSettled([fetchArticles(), fetchSources(), fetchCategories()]);
  }, [fetchArticles, fetchSources, fetchCategories]);

  useEffect(() => {
    Promise.all([fetchArticles(), fetchSources(), fetchCategories()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    articles,
    sources,
    categories,
    articleTags,
    loading,
    loadingTimedOut,
    error,
    fetchArticles,
    fetchTagsForArticles,
    incrementViews,
    getFeaturedArticles,
    getTrendingTags,
    refreshData,
  };
};
