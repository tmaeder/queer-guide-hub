import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Tables } from '@/integrations/supabase/types';

export type DigestArticle = Tables<'news_articles'>;

/**
 * Personal news digest for the /hub News module: the viewer's saved stories
 * and recent articles matching the tags they follow. Read-only aggregation —
 * no personalization engine, no new RPC (plain PostgREST).
 */
export function useNewsDigest() {
  const { user } = useAuth();

  const saved = useQuery({
    queryKey: ['news-digest', 'saved', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DigestArticle[]> => {
      const { data: favs, error: favErr } = await supabase
        .from('news_favorites')
        .select('article_id')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (favErr) throw favErr;
      const ids = (favs ?? []).map((f) => f.article_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .in('id', ids)
        .is('duplicate_of_id', null)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DigestArticle[];
    },
  });

  const fromTags = useQuery({
    queryKey: ['news-digest', 'tags', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<{ tags: string[]; articles: DigestArticle[] }> => {
      const { data: tagFavs, error: tagErr } = await supabase
        .from('tag_favorites')
        .select('tag_id')
        .eq('user_id', user!.id);
      if (tagErr) throw tagErr;
      const tagIds = (tagFavs ?? []).map((t) => t.tag_id);
      if (!tagIds.length) return { tags: [], articles: [] };

      const { data: tagRows, error: slugErr } = await supabase
        .from('unified_tags')
        .select('slug')
        .in('id', tagIds);
      if (slugErr) throw slugErr;
      const slugs = (tagRows ?? []).map((t) => t.slug).filter(Boolean) as string[];
      if (!slugs.length) return { tags: [], articles: [] };

      // Recent articles whose tags[] overlap the followed tag slugs.
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .overlaps('tags', slugs)
        .is('duplicate_of_id', null)
        .order('published_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return { tags: slugs, articles: (data ?? []) as DigestArticle[] };
    },
  });

  return {
    saved: saved.data ?? [],
    savedLoading: saved.isLoading,
    followedTags: fromTags.data?.tags ?? [],
    tagArticles: fromTags.data?.articles ?? [],
    tagLoading: fromTags.isLoading,
  };
}
