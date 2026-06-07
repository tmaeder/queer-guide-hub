import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CityCoverageGap {
  city_id: string;
  city_name: string | null;
  gap_score: number;
  missing_fields: string[] | null;
  resolution: string;
}

export interface CityQualitySummary {
  gaps: CityCoverageGap[];
  needsAttention: number;
  reviewOpen: number;
  lowCompleteness: number;
  ghosts: number;
}

/** Health summary for the City Truth Engine (coverage gaps + queue + counts). */
export function useCityQualitySummary() {
  return useQuery<CityQualitySummary>({
    queryKey: ['city-quality-summary'],
    queryFn: async () => {
      const [gaps, needsAttention, reviewOpen, lowCompleteness, ghosts] = await Promise.all([
        supabase
          .from('city_coverage_gaps')
          .select('city_id, city_name, gap_score, missing_fields, resolution')
          .eq('status', 'open')
          .eq('resolution', 'enrich')
          .order('gap_score', { ascending: false })
          .limit(10),
        supabase.from('cities').select('id', { count: 'exact', head: true }).eq('needs_attention', true).is('duplicate_of_id', null),
        supabase.from('city_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('cities').select('id', { count: 'exact', head: true }).lt('completeness_score', 40).eq('shell_status', 'real').is('duplicate_of_id', null),
        supabase.from('cities').select('id', { count: 'exact', head: true }).eq('shell_status', 'ghost'),
      ]);
      return {
        gaps: (gaps.data ?? []) as CityCoverageGap[],
        needsAttention: needsAttention.count ?? 0,
        reviewOpen: reviewOpen.count ?? 0,
        lowCompleteness: lowCompleteness.count ?? 0,
        ghosts: ghosts.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
