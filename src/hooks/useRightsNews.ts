import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { newsTagsForRight } from '@/lib/rights/rightsNews';
import type { RightTopic } from '@/lib/rights/rightsCatalog';

export type RightsNewsTier =
  'topic-local-recent' | 'topic-global-recent' | 'topic-global-older' | 'rights-general-recent';

export interface RightsNewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  published_at: string;
  publisher_name: string | null;
  source_id: string | null;
  country_ids: string[];
  tags: string[];
  content_language: string | null;
  title_i18n: Record<string, string> | null;
  matched_tags: string[];
  relevance_tier: RightsNewsTier;
  is_local: boolean;
  story_slug: string | null;
  story_title: string | null;
  story_article_count: number;
}

export function useRightsNews(topic: RightTopic, countryId: string | null | undefined, limit = 6) {
  const topicTags = newsTagsForRight(topic);
  return useQuery({
    queryKey: ['rights-news', topic.slug, countryId ?? null, limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RightsNewsArticle[]> => {
      const { data, error } = await untypedRpc<RightsNewsArticle[]>('get_rights_news', {
        p_topic_tags: [...topicTags],
        p_country_id: countryId ?? null,
        p_limit: limit,
        p_recent_days: 30,
        p_max_days: 180,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
