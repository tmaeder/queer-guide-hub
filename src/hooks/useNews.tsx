import { useState, useCallback, useRef } from 'react';
import { hashKey, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLoadingTimedOut } from '@/hooks/useLoadingTimedOut';
import { untypedFrom } from '@/integrations/supabase/untyped';

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

export interface NewsFilters {
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
  sourceIds?: string[];
  category?: string;
  language?: string;
  mediaType?: 'podcast' | 'article';
  sentiment?: string;
  trustScoreMin?: number;
  authorNames?: string[];
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

/** The article list's error copy, shown verbatim by the news pages. */
const LOAD_FAILED = 'Failed to load articles. Please try again.';
const UNEXPECTED = 'An unexpected error occurred. Please try again.';

/**
 * One article-list query (≤200 rows, visibility filters, every NewsFilters
 * dimension, deduped by url), with no React state. Throws with the copy the
 * pages display.
 */
export async function fetchNewsArticles(filters?: NewsFilters): Promise<NewsArticle[]> {
  try {
    const sortField = filters?.sortField || 'published_at';
    const sortOrder = filters?.sortOrder === 'asc';

    let queryBuilder = supabase
      .from('news_articles')
      .select(
        `
        id, slug, title, title_i18n, content_language, excerpt, url, image_url, author,
        published_at, source_id, views_count, is_featured, is_premium,
        country_ids, city_ids, tags, category, category_canonical, publisher_name,
        media_type, audio_url, duration_seconds
      `,
      )
      .not('published_at', 'is', null)
      .not('content', 'is', null)
      .neq('content', '')
      // Approved (passed) rows are always visible — status is the authority, even
      // for short "brief" digests scoring under 50. Legacy null-status rows keep the
      // quality_score>=50 guard. Review/rejected stay hidden.
      .or(
        'quality_status.eq.passed,and(quality_status.is.null,or(quality_score.is.null,quality_score.gte.50))',
      )
      // Hide rows that the canonical_url-dedup pass marked as duplicates of
      // an older row (Group A4).
      .is('duplicate_of_id', null)
      .order(sortField, { ascending: sortOrder });

    // city_ids / country_ids are uuid[] columns — use array overlap, not scalar eq/in
    if (filters?.cityIds && filters.cityIds.length > 0) {
      queryBuilder = (queryBuilder as typeof queryBuilder).overlaps('city_ids', filters.cityIds);
    }
    if (filters?.countryIds && filters.countryIds.length > 0) {
      queryBuilder = (queryBuilder as typeof queryBuilder).overlaps(
        'country_ids',
        filters.countryIds,
      );
    }
    if (filters?.location?.city_id) {
      queryBuilder = (queryBuilder as typeof queryBuilder).contains('city_ids', [
        filters.location.city_id,
      ]);
    }
    if (filters?.location?.country_id) {
      queryBuilder = (queryBuilder as typeof queryBuilder).contains('country_ids', [
        filters.location.country_id,
      ]);
    }
    if (filters?.search && filters.search.trim() !== '') {
      const escaped = filters.search.replace(/[%_,]/g, (m) => `\\${m}`);
      queryBuilder = (queryBuilder as typeof queryBuilder).or(
        `title.ilike.%${escaped}%,content.ilike.%${escaped}%`,
      );
    }
    if (filters?.sourceIds && filters.sourceIds.length > 0) {
      queryBuilder = (queryBuilder as typeof queryBuilder).in('source_id', filters.sourceIds);
    } else if (filters?.sourceId) {
      queryBuilder = (queryBuilder as typeof queryBuilder).eq('source_id', filters.sourceId);
    }
    if (filters?.sentiment) {
      queryBuilder = (queryBuilder as typeof queryBuilder).eq('sentiment', filters.sentiment);
    }
    if (typeof filters?.trustScoreMin === 'number' && filters.trustScoreMin > 0) {
      queryBuilder = (queryBuilder as typeof queryBuilder).gte(
        'trust_score',
        filters.trustScoreMin,
      );
    }
    if (filters?.authorNames && filters.authorNames.length > 0) {
      queryBuilder = (queryBuilder as typeof queryBuilder).in('author', filters.authorNames);
    }
    if (filters?.language) {
      queryBuilder = (queryBuilder as typeof queryBuilder).eq('content_language', filters.language);
    }
    if (filters?.mediaType) {
      queryBuilder = (queryBuilder as typeof queryBuilder).eq('media_type', filters.mediaType);
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
      queryBuilder = (queryBuilder as typeof queryBuilder).gte(
        'published_at',
        filters.dateRange.from,
      );
    }
    if (filters?.dateRange?.to) {
      queryBuilder = (queryBuilder as typeof queryBuilder).lte(
        'published_at',
        filters.dateRange.to,
      );
    }
    if (filters?.tags && filters.tags.length > 0) {
      queryBuilder = (queryBuilder as typeof queryBuilder).overlaps('tags', filters.tags);
    }

    // Restrict to articles that belong to a multi-article story.
    if (filters?.inStory) {
      const { data: storyLinks } = (await untypedFrom('news_story_articles').select(
        'article_id, story_id, news_stories!inner(article_count)',
      )) as unknown as {
        data: Array<{ article_id: string; news_stories: { article_count: number } }> | null;
      };
      const eligibleIds = (storyLinks ?? [])
        .filter((l) => l.news_stories?.article_count >= 2)
        .map((l) => l.article_id);
      if (eligibleIds.length === 0) return [];
      queryBuilder = (queryBuilder as typeof queryBuilder).in('id', eligibleIds);
    }

    const { data, error: fetchError } = await (queryBuilder as typeof queryBuilder).limit(200);
    if (fetchError) {
      console.error('Error fetching articles:', fetchError);
      throw new Error(LOAD_FAILED);
    }
    const seen = new Set<string>();
    return (data ?? []).filter((article: Record<string, unknown>) => {
      const key = (article.url || article.id) as string;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    if (err instanceof Error && err.message === LOAD_FAILED) throw err;
    console.error('Unexpected error:', err);
    throw new Error(UNEXPECTED, { cause: err });
  }
}

// Stable empty fallbacks so consumers' memos/effects don't re-run every render.
const NO_ARTICLES: NewsArticle[] = [];
const NO_SOURCES: NewsSource[] = [];
const NO_CATEGORIES: NewsCategory[] = [];
const NO_TAGS: Record<string, string[]> = {};
const NO_COUNTS: Record<string, number> = {};

/**
 * Declarative article list for one slice (a city, a country, the /news front).
 * `filters: null` stays idle until the scope is known.
 */
export function useNewsArticles(filters: NewsFilters | null) {
  const query = useQuery<NewsArticle[]>({
    queryKey: ['news-articles', filters],
    enabled: filters !== null,
    queryFn: () => fetchNewsArticles(filters ?? undefined),
  });
  return {
    articles: query.data ?? NO_ARTICLES,
    loading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

/**
 * The /news/all list. The page still issues requests through
 * `fetchArticles(filters)`; that records the request, and the query key is
 * the request — so the newest request wins by construction. The old hook
 * had no ordering, and its unfiltered mount fetch could resolve after the
 * page's URL-filtered one and overwrite it. Re-issuing the identical request
 * refetches (retry, refresh).
 *
 * `initial` (lazy) is the first request — pass the URL's filters so a deep
 * link's first query is already the filtered one, not an unfiltered list
 * followed by a correction.
 */
export function useNewsArticlesFeed(initial: () => NewsFilters = () => ({})) {
  const [request, setRequest] = useState<NewsFilters>(initial);
  const requestRef = useRef<NewsFilters>(request);
  const query = useQuery<NewsArticle[]>({
    queryKey: ['news-articles', request],
    queryFn: () => fetchNewsArticles(request),
  });
  const { refetch } = query;
  const fetchArticles = useCallback(
    async (filters?: NewsFilters) => {
      const next = filters ?? {};
      // A ref, not the state: two calls in one tick must compare against each
      // other, and the refetch must not run inside a state updater.
      if (hashKey([requestRef.current]) === hashKey([next])) {
        void refetch();
        return;
      }
      requestRef.current = next;
      setRequest(next);
    },
    [refetch],
  );
  const rerun = useCallback(() => {
    void refetch();
  }, [refetch]);
  const loading = query.isLoading;
  return {
    articles: query.data ?? NO_ARTICLES,
    loading,
    loadingTimedOut: useLoadingTimedOut(loading, hashKey([request])),
    error: query.error ? query.error.message : null,
    fetchArticles,
    /** Re-run the current request, filters and all (retry, refresh). */
    refetch: rerun,
  };
}

export function useNewsSources() {
  const { data } = useQuery({
    queryKey: ['news-sources'],
    queryFn: async (): Promise<NewsSource[]> => {
      // Exclude aggregator providers (NewsAPI, GNews, NewsData, TheNewsAPI) so
      // the Source dropdown only contains real publications.
      // is_aggregator was added in migration news_qa_add_category_canonical_and_aggregator.
      //
      // Explicit columns, NOT select('*'). anon's table-wide SELECT grant on
      // news_sources was replaced by a column allowlist (RLS filters ROWS, not
      // columns, so `*` was serving last_error / reliability_score /
      // auto_paused_reason / consecutive_failures to every logged-out visitor).
      // A `*` here now fails 42501 for anon — and Postgres does not name the
      // offending column in that error, so the breakage looks unrelated.
      // untypedFrom: slug / description / website_url / episode_count are newer
      // than the last `supabase gen types` run, and naming an unknown column in
      // a typed select collapses the whole builder to SelectQueryError.
      //
      // id/name/url only: the Source dropdown and sourcesMap read nothing else,
      // and `description` alone made this ~111 KB gzipped on every news page.
      const { data, error } = await untypedFrom('news_sources')
        .select('id, name, url')
        .eq('is_active', true)
        .or('is_aggregator.is.null,is_aggregator.eq.false')
        .order('name', { ascending: true });
      if (error) {
        console.warn('Error fetching sources:', error);
        throw error;
      }
      return (data ?? []) as unknown as NewsSource[];
    },
  });
  return data ?? NO_SOURCES;
}

export function useNewsCategories() {
  const { data } = useQuery({
    queryKey: ['news-categories'],
    queryFn: async (): Promise<NewsCategory[]> => {
      const { data, error } = await supabase
        .from('news_categories')
        .select('id, name, slug, description, color, icon, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) {
        console.warn('Error fetching categories:', error);
        throw error;
      }
      return (data ?? []) as NewsCategory[];
    },
  });
  return data ?? NO_CATEGORIES;
}

/**
 * True per-category and global totals from `count: 'exact', head: true`
 * queries — independent of the 200-row slice rendered. Without these every
 * tab badge would show the same number. Waits for the category list.
 */
export function useNewsCategoryCounts(categories: NewsCategory[]) {
  const slugs = categories.map((c) => c.slug);
  const { data } = useQuery({
    queryKey: ['news-category-counts', slugs],
    enabled: slugs.length > 0,
    queryFn: async () => {
      // Mirror the visibility filters from fetchNewsArticles so badge counts
      // agree with what a tab click would actually load.
      const applyBaseFilters = <T extends ReturnType<typeof supabase.from>>(q: T) =>
        (q as unknown as ReturnType<typeof supabase.from>)
          .not('published_at', 'is', null)
          .not('content', 'is', null)
          .neq('content', '')
          .or(
            'quality_status.eq.passed,and(quality_status.is.null,or(quality_score.is.null,quality_score.gte.50))',
          )
          .is('duplicate_of_id', null) as unknown as T;
      const total = await applyBaseFilters(
        supabase.from('news_articles').select('*', { count: 'exact', head: true }),
      );
      const pairs = await Promise.all(
        slugs.map(async (raw) => {
          const slug = raw.replace(/[(),]/g, '');
          const res = await applyBaseFilters(
            supabase.from('news_articles').select('*', { count: 'exact', head: true }),
          ).or(`category_canonical.eq.${slug},category.eq.${slug}`);
          return [raw, res.count ?? 0] as const;
        }),
      );
      const counts: Record<string, number> = {};
      for (const [slug, c] of pairs) counts[slug] = c;
      return { total: total.count ?? null, counts };
    },
  });
  return { categoryCounts: data?.counts ?? NO_COUNTS, totalArticles: data?.total ?? null };
}

/** Tags for the visible articles in one batch (replaces per-card queries). */
export function useNewsArticleTags(articleIds: string[]) {
  const { data } = useQuery({
    queryKey: ['news-article-tags', articleIds],
    enabled: articleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_tag_assignments')
        .select('entity_id, unified_tags!inner(name)')
        .eq('entity_type', 'news')
        .in('entity_id', articleIds);
      if (error) {
        console.warn('Failed to batch-fetch tags:', error);
        throw error;
      }
      const tagMap: Record<string, string[]> = {};
      (data ?? []).forEach((row: { entity_id: string; unified_tags: { name: string } }) => {
        if (!tagMap[row.entity_id]) tagMap[row.entity_id] = [];
        tagMap[row.entity_id].push(row.unified_tags.name);
      });
      return tagMap;
    },
  });
  return data ?? NO_TAGS;
}

export function useFeaturedNewsArticles() {
  const { data } = useQuery({
    queryKey: ['news-featured-articles'],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('news_articles')
        .select(
          `
        id, slug, title, title_i18n, content_language, excerpt, url, image_url, author,
        published_at, source_id, views_count, is_featured, is_premium,
        country_ids, city_ids, tags, category, category_canonical, publisher_name,
        media_type, audio_url, duration_seconds
      `,
        )
        .eq('is_featured', true)
        .eq('is_premium', false)
        .not('published_at', 'is', null)
        .not('content', 'is', null)
        .neq('content', '')
        .or(
          'quality_status.eq.passed,and(quality_status.is.null,or(quality_score.is.null,quality_score.gte.50))',
        )
        .is('duplicate_of_id', null)
        .order('published_at', { ascending: false })
        .limit(5);

      if (fetchError) {
        console.warn('Error fetching featured articles:', fetchError);
        return [];
      }
      return data ?? [];
    },
  });
  return data ?? NO_ARTICLES;
}

const NO_TRENDING: { tag: string; count: number }[] = [];

export function useTrendingNewsTags() {
  const { data } = useQuery({
    queryKey: ['news-trending-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('name, usage_count')
        .gt('usage_count', 0)
        .order('usage_count', { ascending: false })
        .limit(12);
      if (error) {
        console.warn('Error fetching trending tags:', error);
        return [];
      }
      return (data ?? []).map((item: { name: string; usage_count: number }) => ({
        tag: item.name,
        count: item.usage_count || 0,
      }));
    },
  });
  return data ?? NO_TRENDING;
}

export async function incrementArticleViews(articleId: string) {
  try {
    const { error } = await supabase.rpc('increment_article_views', { article_id: articleId });
    if (error) console.warn('Error incrementing views:', error);
  } catch (err) {
    console.warn('Error incrementing views:', err);
  }
}
