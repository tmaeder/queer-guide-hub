import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  // get_news_front isn't in the generated types.ts (too large to regen) — bridge untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_news_front', params);
  if (error) throw error;
  return (data ?? []) as NewsFrontArticle[];
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
 * Global fresh front. Ordered purely by hotness (recency × quality × soft
 * featured boost × trending) so the headline is authoritative and shareable —
 * identical for every visitor, always fresh. The `auth.uid()` the client sends
 * still lets the RPC fill `is_read` for badge/demote use, but does not reorder.
 */
export function useNewsFront(limit = 40, windowDays = 21) {
  const query = useQuery({
    queryKey: ['news-front', limit, windowDays],
    ...LIVE_OPTS,
    queryFn: () => callNewsFront({ p_limit: limit, p_window_days: windowDays }),
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
