import { useCallback } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

// Records a (user, article) read pair. Idempotent — PK on (user_id, article_id)
// means the second call is a no-op via ON CONFLICT DO NOTHING. Safe to call
// once on detail-page mount; aborts silently when signed out.
export function useUserNewsReads() {
  const { user } = useAuth();

  const markRead = useCallback(
    async (articleId: string) => {
      if (!user) return;
      try {
        await untypedFrom('user_news_reads')
          .upsert(
            { user_id: user.id, article_id: articleId } as never,
            { onConflict: 'user_id,article_id', ignoreDuplicates: true } as never,
          );
      } catch {
        // Reading-history failures must never break article rendering.
      }
    },
    [user],
  );

  return { markRead };
}
