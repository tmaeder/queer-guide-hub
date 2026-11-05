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
import { useState, useCallback, useEffect, useRef } from 'react';
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
  totalHits?: number;
  estimatedTotalHits?: number;
}

const PAGE_SIZE = 24;
const MAX_SEARCH_PAGE = 200; // search-proxy accepts zero-based pages 0–200.

const SORT_MAP: Record<string, string> = {
  'date-desc': 'date_desc',
  'date-asc': 'date_asc',
  'views-desc': 'trust',
};

export function useNewsSearch() {
  const [articles, setArticles] = useState<Record<string, unknown>[]>([]);
  const [totalHits, setTotalHits] = useState<number | null>(null);
  const [facets, setFacets] = useState<Record<string, Record<string, number>>>({});
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const cancelSearch = useCallback(() => activeRequest.current?.abort(), []);
  useEffect(() => cancelSearch, [cancelSearch]);

  const searchArticles = useCallback(async (
    query: string,
    filters: NewsSearchFilters = {},
    page = 0,
    sort = 'date-desc',
  ) => {
    const q = query.trim();
    if (q.length < 2) return;

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const { signal } = controller;
    if (page === 0) {
      setArticles([]);
      setNextPage(null);
      setTotalHits(null);
      setFacets({});
    }
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
        hitsPerPage: PAGE_SIZE,
        page,
      }, { signal });
      if (signal.aborted) return;

      const rankedIds = [...new Set(result.hits
        .filter((h) => h.type === 'news' && h.objectID)
        .map((h) => h.objectID as string))];

      const hasLocalFilters = !!(
        filters.language || filters.mediaType || filters.sentiment || filters.trustScoreMin ||
        filters.authorNames?.length || filters.sourceIds?.length ||
        filters.countryIds?.length || filters.cityIds?.length
      );
      const total = result.totalHits ?? result.estimatedTotalHits;
      const more = page < MAX_SEARCH_PAGE && result.hits.length > 0 && (
        total == null ? result.hits.length === PAGE_SIZE : (page + 1) * PAGE_SIZE < total
      );
      const completePage = (items: Record<string, unknown>[]) => {
        setArticles((previous) => {
          if (page === 0) return items;
          const seen = new Set(previous.map((article) => article.id));
          return [...previous, ...items.filter((item) => !seen.has(item.id))];
        });
        setTotalHits(hasLocalFilters ? null : (total ?? null));
        setFacets(result.facetDistribution ?? {});
        setNextPage(more ? page + 1 : null);
      };

      if (rankedIds.length === 0) {
        completePage([]);
        return;
      }

      const { data, error: dbErr } = await supabase
        .from('news_articles')
        .select(SELECT_FIELDS)
        .in('id', rankedIds)
        .abortSignal(signal);
      if (signal.aborted) return;

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

      completePage(postFiltered);
    } catch (err) {
      if (signal.aborted) return;
      if (isSearchUnavailable(err)) {
        setError(SEARCH_UNAVAILABLE_MESSAGE);
      } else {
        setError('Search failed. Please try again.');
      }
    } finally {
      if (!signal.aborted) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  const reset = useCallback((pending = false) => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setArticles([]);
    setNextPage(null);
    setTotalHits(null);
    setFacets({});
    setError(null);
    setLoading(pending);
  }, []);

  return { articles, totalHits, facets, nextPage, loading, error, searchArticles, cancelSearch, reset };
}
