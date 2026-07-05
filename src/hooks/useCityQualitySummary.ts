import { supabase } from '@/integrations/supabase/client';
import { createQualitySummaryHook } from '@/hooks/quality/createQualitySummaryHook';

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
export const useCityQualitySummary = createQualitySummaryHook({
  queryKey: 'city-quality-summary',
  metrics: {
    gaps: {
      kind: 'rows',
      build: () =>
        supabase
          .from('city_coverage_gaps')
          .select('city_id, city_name, gap_score, missing_fields, resolution')
          .eq('status', 'open')
          .eq('resolution', 'enrich')
          .order('gap_score', { ascending: false })
          .limit(10),
    },
    needsAttention: {
      kind: 'count',
      build: () =>
        supabase
          .from('cities')
          .select('id', { count: 'exact', head: true })
          .eq('needs_attention', true)
          .is('duplicate_of_id', null),
    },
    reviewOpen: {
      kind: 'count',
      build: () =>
        supabase.from('city_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    },
    lowCompleteness: {
      kind: 'count',
      build: () =>
        supabase
          .from('cities')
          .select('id', { count: 'exact', head: true })
          .lt('completeness_score', 40)
          .eq('shell_status', 'real')
          .is('duplicate_of_id', null),
    },
    ghosts: {
      kind: 'count',
      build: () =>
        supabase.from('cities').select('id', { count: 'exact', head: true }).eq('shell_status', 'ghost'),
    },
  },
  reshape: (r): CityQualitySummary => ({
    gaps: r.gaps as CityCoverageGap[],
    needsAttention: r.needsAttention,
    reviewOpen: r.reviewOpen,
    lowCompleteness: r.lowCompleteness,
    ghosts: r.ghosts,
  }),
});
