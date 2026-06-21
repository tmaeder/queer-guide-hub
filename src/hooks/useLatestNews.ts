import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LatestNewsArticle {
  id: string;
  slug: string;
  title: string;
  title_i18n: Record<string, string> | null;
  content_language: string | null;
  excerpt: string | null;
  image_url: string | null;
  published_at: string;
  publisher_name: string | null;
}

/**
 * Lightweight latest-news query for the homepage rail. Fetches only the few
 * rows + columns the card renders — no categories, sources, or per-category
 * count queries (that machinery lives in `useNews` for the full /news page).
 * Mirrors the same quality/dedup filters so the homepage and /news agree.
 */
export function useLatestNews(limit = 6) {
  const query = useQuery({
    queryKey: ['latest-news', limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LatestNewsArticle[]> => {
      const { data, error } = await supabase
        .from('news_articles')
        .select('id, slug, title, title_i18n, content_language, excerpt, image_url, published_at, publisher_name')
        .not('published_at', 'is', null)
        .not('content', 'is', null)
        .neq('content', '')
        .or('quality_score.is.null,quality_score.gte.50')
        .or('quality_status.is.null,quality_status.eq.passed')
        .is('duplicate_of_id', null)
        .order('published_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LatestNewsArticle[];
    },
  });

  return {
    articles: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}
