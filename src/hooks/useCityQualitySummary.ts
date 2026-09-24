import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';

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
  scorecard: CityQualityScorecard;
}

export interface CityQualityScorecard {
  probe_ok: boolean;
  generated_at: string;
  totals: {
    rows: number;
    canonical: number;
    indexable: number;
    publication_ready: number;
    publication_blocked: number;
  };
  lifecycle: Record<string, number>;
  dimensions: Record<string, number | null>;
  dimension_distributions: Record<
    string,
    { critical_0_39: number; needs_work_40_69: number; strong_70_100: number }
  >;
  issues: Record<string, number>;
  operations: {
    unlinked_venues: number;
    unlinked_events: number;
    other_venues: number;
    other_events: number;
    ghosts_with_live_children: number;
    merged_rows_with_live_children: number;
    image_automation_backlog: number;
    image_automation_no_progress: boolean;
    verified_city_images: number;
    descriptions_with_provenance: number;
    oldest_unresolved_issue: string | null;
  };
  samples: Array<{ id: string; name: string; slug: string; blockers: string[] }>;
  automation: { last_run_at: string | null; last_run_status: string; fresh: boolean };
  trends: Array<{ date: string; publication_blocked: number; publication_ready: number }>;
}

/** Admin city-health summary. A failed scorecard probe throws instead of being
 * coerced to zero, so the panel can distinguish clean data from missing data. */
export function useCityQualitySummary() {
  return useQuery<CityQualitySummary>({
    queryKey: ['city-quality-summary'],
    queryFn: async () => {
      const [scorecardResult, gapsResult, attentionResult, reviewResult, completenessResult] =
        await Promise.all([
          untypedRpc<CityQualityScorecard>('city_quality_scorecard'),
          supabase
            .from('city_coverage_gaps')
            .select('city_id, city_name, gap_score, missing_fields, resolution')
            .eq('status', 'open')
            .eq('resolution', 'enrich')
            .order('gap_score', { ascending: false })
            .limit(10),
          supabase
            .from('cities')
            .select('id', { count: 'exact', head: true })
            .eq('needs_attention', true)
            .is('duplicate_of_id', null),
          supabase
            .from('city_review_queue')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open'),
          supabase
            .from('cities')
            .select('id', { count: 'exact', head: true })
            .lt('completeness_score', 40)
            .eq('shell_status', 'real')
            .is('duplicate_of_id', null),
        ]);

      const firstError = [
        scorecardResult.error,
        gapsResult.error,
        attentionResult.error,
        reviewResult.error,
        completenessResult.error,
      ].find(Boolean);
      if (firstError) throw new Error(firstError.message);
      if (!scorecardResult.data?.probe_ok) {
        throw new Error('City quality probe did not return a valid result.');
      }

      return {
        gaps: (gapsResult.data ?? []) as CityCoverageGap[],
        needsAttention: attentionResult.count ?? 0,
        reviewOpen: reviewResult.count ?? 0,
        lowCompleteness: completenessResult.count ?? 0,
        ghosts: scorecardResult.data.lifecycle.archived_non_place ?? 0,
        scorecard: scorecardResult.data,
      };
    },
    staleTime: 60_000,
  });
}
