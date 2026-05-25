import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Tables } from '@/integrations/supabase/types';

export type SavedArticle = Pick<
  Tables<'news_articles'>,
  'id' | 'slug' | 'title' | 'excerpt' | 'image_url' | 'published_at' | 'category' | 'publisher_name'
> & { saved_at: string; is_read: boolean };

interface Options {
  limit?: number;
}

// Returns the signed-in user's saved news articles. Joins news_favorites →
// news_articles, then cross-references user_news_reads to mark each as
// read / unread (so the reader page can show how many saves are still
// waiting).
export function useSavedNewsArticles({ limit = 50 }: Options = {}) {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedArticle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const favs = await supabase
        .from('news_favorites' as never)
        .select(
          'created_at, news_articles!inner(id, slug, title, excerpt, image_url, published_at, category, publisher_name)' as never,
        )
        .eq('user_id' as never, user.id as never)
        .order('created_at' as never, { ascending: false } as never)
        .limit(limit);

      const favRows = (favs.data ?? []) as unknown as Array<{
        created_at: string;
        news_articles: Omit<SavedArticle, 'saved_at' | 'is_read'>;
      }>;

      const articleIds = favRows.map((r) => r.news_articles.id);

      let readSet = new Set<string>();
      if (articleIds.length > 0) {
        const reads = await supabase
          .from('user_news_reads' as never)
          .select('article_id' as never)
          .eq('user_id' as never, user.id as never)
          .in('article_id' as never, articleIds as never);
        readSet = new Set(
          ((reads.data ?? []) as unknown as Array<{ article_id: string }>).map(
            (r) => r.article_id,
          ),
        );
      }

      if (cancelled) return;
      setItems(
        favRows.map((r) => ({
          ...r.news_articles,
          saved_at: r.created_at,
          is_read: readSet.has(r.news_articles.id),
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only user identity (via user?.id) and limit drive the refetch; pulling the whole `user` object would re-run on every TOKEN_REFRESHED.
  }, [user?.id, limit]);

  return { items, loading };
}
