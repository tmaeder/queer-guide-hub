/**
 * Semantic news search via the search-proxy worker (vector + FTS RRF fusion).
 * Used when quickSearch.length >= 2 in NewsArchive. For filter-only browsing,
 * useNews.fetchArticles (direct Supabase) is used instead.
 *
 * Two-step: worker returns ranked entity IDs from search_documents, then we
 * batch-enrich from news_articles to get the full schema NewsCard expects.
 * Post-filters (language, mediaType, sentiment, trustScore, authors, sources,
 * country/city) not supported by the worker are applied client-side on the
 * batch-enriched slice.
 */
import { useState, useCallback } from 'react';
import { searchFetch, isSearchUnavailable, SEARCH_UNAVAILABLE_MESSAGE } from '@/lib/searchFetch';
import { supabase } from '@/integrations/supabase/client';

const SELECT_FIELDS = [
  'id', 'slug', 'title', 'title_i18n', 'content_language', 'excerpt', 'url',
  'image_url', 'author', 'published_at', 'source_id', 'views_count', 'is_featured',
  'is_premium', 'country_ids', 'city_ids', 'tags', 'category', 'category_canonical',
  'publisher_name', 'media_type', 'audio_url', 'duration_seconds', 'trust_score', 'sentiment',
].join(', ');

export interface NewsSearchFilters {
  tags?: string[];
  dateRange?: { from?: string; to?: string };
  featured?: boolean;
  category?: string;
  countryIds?: string[];
  cityIds?: string[];
  sourceIds?: string[];
  language?: string;
  mediaType?: string;
  sentiment?: string;
  trustScoreMin?: number;
  authorNames?: string[];
}

interface WorkerSearchResponse {
  hits: Array<{ objectID?: string; type?: string; [key: string]: unknown }>;
  facetDistribution: Record<string, Record<string, number>>;
  estimatedTotalHits: number;
}

const SORT_MAP: Record<string, string> = {
  'date-desc': 'date_desc',
  'date-asc': 'date_asc',
  'views-desc': 'trust',
};

export function useNewsSearch() {
  const [articles, setArticles] = useState<Record<string, unknown>[]>([]);
  const [totalHits, setTotalHits] = useState<number | null>(null);
  const [facets, setFacets] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchArticles = useCallback(async (
    query: string,
    filters: NewsSearchFilters = {},
    page = 0,
    sort = 'date-desc',
  ) => {
    const q = query.trim();
    if (q.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const workerFilters: Record<string, unknown> = { types: ['news'] };
      if (filters.tags?.length) workerFilters.tags = filters.tags;
      if (filters.category) workerFilters.categories = [filters.category];
      if (filters.featured) workerFilters.featured = true;
      if (filters.dateRange?.from) workerFilters.date_from = filters.dateRange.from;
      if (filters.dateRange?.to) workerFilters.date_to = filters.dateRange.to;
      const sortMode = SORT_MAP[sort];
      if (sortMode) workerFilters.sort = sortMode;

      const result = await searchFetch<WorkerSearchResponse>('/search', {
        query: q,
        filters: workerFilters,
        hitsPerPage: 24,
        page,
      });

      const rankedIds = result.hits
        .filter((h) => h.type === 'news' && h.objectID)
        .map((h) => h.objectID as string);

      setTotalHits(result.estimatedTotalHits ?? null);
      setFacets(result.facetDistribution ?? {});

      if (rankedIds.length === 0) {
        setArticles([]);
        return;
      }

      const { data, error: dbErr } = await supabase
        .from('news_articles')
        .select(SELECT_FIELDS)
        .in('id', rankedIds);

      if (dbErr) {
        setError('Failed to load articles.');
        return;
      }

      const articleMap = new Map(
        (data as Record<string, unknown>[] ?? []).map((a) => [a.id as string, a]),
      );

      // Re-order by search ranking, then apply post-filters for fields the worker
      // doesn't filter on (language, media_type, sentiment, trust, author, source, geo).
      const ordered = rankedIds
        .map((id) => articleMap.get(id))
        .filter((a): a is Record<string, unknown> => Boolean(a));

      const postFiltered = ordered.filter((a) => {
        if (filters.language && a.content_language !== filters.language) return false;
        if (filters.mediaType && a.media_type !== filters.mediaType) return false;
        if (filters.sentiment && a.sentiment !== filters.sentiment) return false;
        if (typeof filters.trustScoreMin === 'number' && filters.trustScoreMin > 0) {
          if ((a.trust_score as number ?? 0) < filters.trustScoreMin) return false;
        }
        if (filters.authorNames?.length && !filters.authorNames.includes(a.author as string)) return false;
        if (filters.sourceIds?.length && !filters.sourceIds.includes(a.source_id as string)) return false;
        if (filters.countryIds?.length) {
          const cIds = (a.country_ids as string[] | null) ?? [];
          if (!filters.countryIds.some((c) => cIds.includes(c))) return false;
        }
        if (filters.cityIds?.length) {
          const ciIds = (a.city_ids as string[] | null) ?? [];
          if (!filters.cityIds.some((c) => ciIds.includes(c))) return false;
        }
        return true;
      });

      setArticles(postFiltered);
    } catch (err) {
      if (isSearchUnavailable(err)) {
        setError(SEARCH_UNAVAILABLE_MESSAGE);
      } else {
        setError('Search failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setArticles([]);
    setTotalHits(null);
    setFacets({});
    setError(null);
    setLoading(false);
  }, []);

  return { articles, totalHits, facets, loading, error, searchArticles, reset };
}
