import { useQuery } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

/**
 * Row returned by the `get_news_front` RPC. A superset of the columns the
 * news cards render, plus the ranking signals (hotness / personal_score /
 * matches_interest / is_read) the page can use to label or order content.
 */
export interface NewsFrontArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  url: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string;
  source_id: string | null;
  views_count: number | null;
  is_featured: boolean | null;
  is_premium: boolean | null;
  country_ids: string[] | null;
  city_ids: string[] | null;
  tags: string[] | null;
  category: string | null;
  category_canonical: string | null;
  publisher_name: string | null;
  title_i18n: Record<string, string> | null;
  content_language: string | null;
  media_type: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  hotness: number;
  personal_score: number;
  matches_interest: boolean;
  is_read: boolean;
}

interface FrontParams {
  p_limit?: number;
  p_country_ids?: string[] | null;
  p_city_ids?: string[] | null;
  p_window_days?: number;
  p_personalized_only?: boolean;
}

async function callNewsFront(params: FrontParams): Promise<NewsFrontArticle[]> {
  // get_news_front isn't in the generated types.ts — bridge via untypedRpc.
  const { data, error } = await untypedRpc<NewsFrontArticle[]>('get_news_front', params);
  if (error) throw error;
  return data ?? [];
}

// Keep the front page live without a manual refresh: 1-min stale, 5-min poll,
// and a refetch whenever the tab regains focus. This is what stops a stale
// headline from sticking — the ranking re-decays on every refetch.
const LIVE_OPTS = {
  staleTime: 60 * 1000,
  refetchInterval: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
} as const;

/**
 * Global fresh front. The RPC's own ORDER BY is raw hotness (recency × quality
 * × soft featured boost × trending), so the headline is authoritative and
 * shareable. The `auth.uid()` the client sends still lets the RPC fill
 * `is_read`, `tag_match` and therefore `personal_score`.
 *
 * `geo` is a BOOST, never a filter. Passing country/city ids with
 * `p_personalized_only: false` leaves the WHERE clause admitting everything —
 * only `personal_score` changes (×1.25 on a geo hit). A caller that wants the
 * boost applied sorts by `personal_score` itself; one that wants the global
 * consensus order leaves the array as returned.
 *
 * Filtering on geo was measured and rejected: articles per country over 21 days
 * run US 404 · GB 105 · AU 71 · DE 14, so a region FILTER hands most European
 * visitors a three-item band. 24·log2(1.25) = 7.7, i.e. the boost lets a local
 * story outrank a non-local one up to 7.7 hours newer — enough to pull local
 * items into view, not enough to lead with week-old news.
 */
export function useNewsFront(
  limit = 40,
  windowDays = 21,
  geo?: { countryIds?: string[] | null; cityIds?: string[] | null },
) {
  const countryIds = geo?.countryIds ?? null;
  const cityIds = geo?.cityIds ?? null;
  const query = useQuery({
    // Both geo args belong in the key: they change `personal_score` on every
    // row, so a cached result from before the region resolved is a different
    // ranking, not the same one.
    queryKey: ['news-front', limit, windowDays, countryIds, cityIds],
    ...LIVE_OPTS,
    queryFn: () =>
      callNewsFront({
        p_limit: limit,
        p_window_days: windowDays,
        p_country_ids: countryIds,
        p_city_ids: cityIds,
      }),
  });
  return {
    articles: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
}

/**
 * Personalized "For You" feed for signed-in users. Filters to articles that
 * match the user's followed tags + profile interests (and optional geo), ranked
 * by the personalized score (interest/geo boosts, already-read demoted).
 * Disabled (and returns []) for signed-out visitors.
 */
export function useForYouNews(limit = 6, countryIds?: string[] | null) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['news-for-you', user?.id ?? 'anon', limit, countryIds ?? null],
    enabled: !!user,
    ...LIVE_OPTS,
    queryFn: () =>
      callNewsFront({
        p_limit: limit,
        p_personalized_only: true,
        p_country_ids: countryIds ?? null,
        p_window_days: 30,
      }),
  });
  return {
    articles: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
}

/**
 * Newest podcast episodes for the homepage band's Podcasts chip.
 *
 * The chip used to filter the ranked `get_news_front` pool, and that pool can
 * never hold enough episodes: hotness decays 50% per 24h, articles publish
 * through the day while most shows drop overnight, so measured on 2026-10-25
 * the best-ranked of 164 eligible episodes sat at position 99 — zero in the
 * 80-row pool, so the chip stayed disabled for every visitor. Episodes are a
 * different KIND of thing (`media_type`, not a category), so they get their own
 * query, newest first.
 *
 * Visibility predicate is the RPC's `base` CTE, kept in step deliberately: a
 * looser one would publish episodes the news pipeline rejected.
 */
export function useFrontPodcasts(limit = 16, windowDays = 21) {
  const query = useQuery({
    queryKey: ['news-front-podcasts', limit, windowDays],
    ...LIVE_OPTS,
    queryFn: async () => {
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await untypedFrom('news_articles')
        .select(
          'id, slug, title, excerpt, image_url, published_at, publisher_name, category_canonical, media_type, title_i18n',
        )
        .eq('media_type', 'podcast')
        .gt('published_at', since)
        .not('content', 'is', null)
        .neq('content', '')
        .is('duplicate_of_id', null)
        .or('is_premium.is.null,is_premium.eq.false')
        .or(
          'quality_status.eq.passed,and(quality_status.is.null,or(quality_score.is.null,quality_score.gte.50))',
        )
        .order('published_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as Array<
        Pick<
          NewsFrontArticle,
          | 'id'
          | 'slug'
          | 'title'
          | 'excerpt'
          | 'image_url'
          | 'published_at'
          | 'publisher_name'
          | 'category_canonical'
          | 'media_type'
          | 'title_i18n'
        >
      >;
    },
  });
  return {
    articles: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}
