import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagQualityScorecard {
  active_total: number;
  mean_score: number | null;
  scored: number;
  gaps: {
    description: number;
    image: number;
    category: number;
    i18n: number;
    links: number;
    used: number;
    embedding: number;
  };
  buckets: {
    p0_20: number;
    p20_40: number;
    p40_60: number;
    p60_80: number;
    p80_100: number;
  };
  sensitive_unreviewed: number;
}

/** Aggregate content-quality scorecard for active tags (tag_quality_scorecard RPC). */
export function useTagQualityScorecard() {
  return useQuery<TagQualityScorecard | null>({
    queryKey: ['tag-quality-scorecard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tag_quality_scorecard');
      if (error) throw error;
      return (data ?? null) as TagQualityScorecard | null;
    },
    staleTime: 60_000,
  });
}
