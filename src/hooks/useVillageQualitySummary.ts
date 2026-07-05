import { supabase } from '@/integrations/supabase/client';
import { createQualitySummaryHook } from '@/hooks/quality/createQualitySummaryHook';

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
export const useVillageQualitySummary = createQualitySummaryHook({
  queryKey: 'village-quality-summary',
  metrics: {
    gaps: {
      kind: 'rows',
      build: () =>
        supabase
          .from('village_coverage_gaps')
          .select('village_id, village_name, gap_score, missing_fields, resolution')
          .eq('status', 'open')
          .eq('resolution', 'enrich')
          .order('gap_score', { ascending: false })
          .limit(12),
    },
    total: {
      kind: 'count',
      build: () => supabase.from('queer_villages').select('id', { count: 'exact', head: true }),
    },
    withVenues: {
      kind: 'rows',
      build: () =>
        supabase
          .from('venues')
          .select('queer_village_id')
          .not('queer_village_id', 'is', null)
          .is('duplicate_of_id', null),
    },
    reviewOpen: {
      kind: 'count',
      build: () =>
        supabase.from('village_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    },
    lowCompleteness: {
      kind: 'count',
      build: () =>
        supabase
          .from('queer_villages')
          .select('id', { count: 'exact', head: true })
          .lt('completeness_score', 40)
          .eq('shell_status', 'real'),
    },
    ghosts: {
      kind: 'count',
      build: () =>
        supabase.from('queer_villages').select('id', { count: 'exact', head: true }).eq('shell_status', 'ghost'),
    },
    scores: {
      kind: 'rows',
      build: () => supabase.from('queer_villages').select('completeness_score'),
    },
  },
  reshape: (r): VillageQualitySummary => {
    const distinctVillages = new Set(
      (r.withVenues as { queer_village_id: string }[]).map((row) => row.queer_village_id)
    ).size;
    const all = r.scores as { completeness_score: number }[];
    const avg = all.length
      ? Math.round(all.reduce((s, row) => s + (row.completeness_score ?? 0), 0) / all.length)
      : 0;
    return {
      gaps: r.gaps as VillageCoverageGap[],
      total: r.total,
      withVenues: distinctVillages,
      reviewOpen: r.reviewOpen,
      lowCompleteness: r.lowCompleteness,
      ghosts: r.ghosts,
      avgCompleteness: avg,
    };
  },
});
