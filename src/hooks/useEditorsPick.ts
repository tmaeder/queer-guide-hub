import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

// Fetches the most recent editor's-pick article. New flag (migration
// 20260524220000_news_editorial). Returns null when nothing is flagged.
export function useEditorsPick() {
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('news_articles')
        .select(
          'id, slug, title, excerpt, image_url, author, published_at, source_id, views_count, is_featured, is_premium, country_ids, city_ids, tags, category, category_canonical, publisher_name',
        )
        .eq('is_editors_pick', true)
        .not('published_at', 'is', null)
        .is('duplicate_of_id', null)
        .order('published_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) setArticle(data[0] as unknown as Article);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return article;
}
