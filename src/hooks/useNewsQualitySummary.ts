import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface NewsQualityScorecard {
  total_live: number;
  no_geo: number;
  no_city: number;
  no_author: number;
  thin_lt200: number;
  thin_lt500: number;
  no_image: number;
  no_tags: number;
  no_excerpt: number;
  avg_quality: number | null;
  avg_relevance: number | null;
  qstatus_passed: number;
  qstatus_review: number;
  qstatus_rejected: number;
  qstatus_null: number;
  corroborated: number;
  last_30d: number;
  needs_attention: number;
  last_run_at: string | null;
}

/** Global news content-quality coverage snapshot (news_quality_scorecard view). */
export function useNewsQualitySummary() {
  return useQuery<NewsQualityScorecard | null>({
    queryKey: ['news-quality-scorecard'],
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await untypedFrom('news_quality_scorecard').select('*').maybeSingle();
      return (data ?? null) as NewsQualityScorecard | null;
    },
  });
}
