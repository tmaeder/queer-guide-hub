import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

// Fetches the most recent editor's-pick article. New flag (migration
// 20260524220000_news_editorial). Returns null when nothing is flagged.
//
// react-query rather than useEffect/useState: this feeds the homepage news
// band, which remounts on every navigation back to `/`, and an editorial flag
// changes at human speed.
export function useEditorsPick() {
  const { data } = useQuery({
    queryKey: ['editors-pick'],
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<Article | null> => {
      const { data, error } = await supabase
        .from('news_articles')
        .select(
          'id, slug, title, excerpt, image_url, author, published_at, source_id, views_count, is_featured, is_premium, country_ids, city_ids, tags, category, category_canonical, publisher_name',
        )
        .eq('is_editors_pick', true)
        .not('published_at', 'is', null)
        .is('duplicate_of_id', null)
        .order('published_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as unknown as Article) ?? null;
    },
  });

  return data ?? null;
}
