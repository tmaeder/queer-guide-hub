import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface SavedNewsItem {
  article_id: string;
  title: string;
  slug: string | null;
  published_at: string;
}

/**
 * Saved-news layer: the viewer's news favorites placed on their publish date
 * (the only date news carries). news_favorites has NO FK to news_articles
 * (matches event_favorites), so PostgREST can't embed — two-step fetch:
 * own favorite ids (RLS-scoped), then the dated articles among them.
 */
export function useSavedNewsByDate(from: Date, to: Date, enabled: boolean) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['calendar-news', user?.id, from.toISOString(), to.toISOString()],
    enabled: enabled && !!user,
    queryFn: async (): Promise<SavedNewsItem[]> => {
      const { data: favs, error: favErr } = await supabase
        .from('news_favorites')
        .select('article_id')
        .eq('user_id', user!.id);
      if (favErr) throw favErr;
      const ids = (favs ?? []).map((f) => f.article_id);
      if (ids.length === 0) return [];
      const { data: articles, error: artErr } = await supabase
        .from('news_articles')
        .select('id, title, slug, published_at')
        .in('id', ids)
        .gte('published_at', from.toISOString())
        .lte('published_at', to.toISOString());
      if (artErr) throw artErr;
      return (articles ?? []).map((a) => ({
        article_id: a.id,
        title: a.title,
        slug: a.slug,
        published_at: a.published_at,
      }));
    },
  });
  return { items: query.data ?? [], loading: query.isLoading };
}
