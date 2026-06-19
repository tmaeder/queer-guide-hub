import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VillageCoverageGap {
  village_id: string;
  village_name: string | null;
  gap_score: number;
  missing_fields: string[] | null;
  resolution: string;
}

export interface VillageQualitySummary {
  gaps: VillageCoverageGap[];
  total: number;
  withVenues: number;
  reviewOpen: number;
  lowCompleteness: number;
  ghosts: number;
  avgCompleteness: number;
}

/** Health summary for the Village Truth Engine (coverage gaps + queue + counts). */
export function useVillageQualitySummary() {
  return useQuery<VillageQualitySummary>({
    queryKey: ['village-quality-summary'],
    queryFn: async () => {
      const [gaps, total, withVenues, reviewOpen, lowCompleteness, ghosts, scores] = await Promise.all([
        supabase
          .from('village_coverage_gaps')
          .select('village_id, village_name, gap_score, missing_fields, resolution')
          .eq('status', 'open')
          .eq('resolution', 'enrich')
          .order('gap_score', { ascending: false })
          .limit(12),
        supabase.from('queer_villages').select('id', { count: 'exact', head: true }),
        supabase.from('venues').select('queer_village_id').not('queer_village_id', 'is', null).is('duplicate_of_id', null),
        supabase.from('village_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('queer_villages').select('id', { count: 'exact', head: true }).lt('completeness_score', 40).eq('shell_status', 'real'),
        supabase.from('queer_villages').select('id', { count: 'exact', head: true }).eq('shell_status', 'ghost'),
        supabase.from('queer_villages').select('completeness_score'),
      ]);
      const distinctVillages = new Set((withVenues.data ?? []).map((r) => (r as { queer_village_id: string }).queer_village_id)).size;
      const all = (scores.data ?? []) as { completeness_score: number }[];
      const avg = all.length ? Math.round(all.reduce((s, r) => s + (r.completeness_score ?? 0), 0) / all.length) : 0;
      return {
        gaps: (gaps.data ?? []) as VillageCoverageGap[],
        total: total.count ?? 0,
        withVenues: distinctVillages,
        reviewOpen: reviewOpen.count ?? 0,
        lowCompleteness: lowCompleteness.count ?? 0,
        ghosts: ghosts.count ?? 0,
        avgCompleteness: avg,
      };
    },
    staleTime: 60_000,
  });
}
