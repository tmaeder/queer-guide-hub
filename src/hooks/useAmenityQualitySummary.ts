import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AmenityCoverageGap {
  id: string;
  name: string;
  category: string | null;
  refresh_reason: string;
}

export interface AmenityLastRun {
  finished_at: string | null;
  status: string | null;
  items_examined: number | null;
  summary: { filled?: number; cleaned?: number; gated?: number; circuit_open?: boolean } | null;
}

export interface AmenityQualitySummary {
  total: number;
  withAmenities: number;
  withAccessibility: number;
  noAmenities: number;
  needsAttention: number;
  reviewOpen: number;
  gaps: AmenityCoverageGap[];
  lastRun: AmenityLastRun | null;
}

/** Health summary for the Amenity Truth Engine — live counts (no gaps table). */
export function useAmenityQualitySummary() {
  return useQuery<AmenityQualitySummary>({
    queryKey: ['amenity-quality-summary'],
    queryFn: async () => {
      const live = () => supabase.from('venues').select('id', { count: 'exact', head: true }).is('duplicate_of_id', null).is('closed_at', null);
      const [total, withAmenities, withAccessibility, needsAttention, reviewOpen, gaps, lastRun] = await Promise.all([
        live(),
        live().neq('amenities', '{}'),
        live().neq('accessibility_attributes', '{}'),
        live().eq('needs_attention', true),
        supabase.from('venue_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.rpc('venues_due_for_amenity_backfill', { p_limit: 10 }),
        supabase.from('admin_automation_runs')
          .select('finished_at, status, items_examined, summary')
          .eq('automation_slug', 'amenity_truth_backfill')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const totalCount = total.count ?? 0;
      const withAmenitiesCount = withAmenities.count ?? 0;
      return {
        total: totalCount,
        withAmenities: withAmenitiesCount,
        withAccessibility: withAccessibility.count ?? 0,
        noAmenities: totalCount - withAmenitiesCount,
        needsAttention: needsAttention.count ?? 0,
        reviewOpen: reviewOpen.count ?? 0,
        gaps: ((gaps.data ?? []) as AmenityCoverageGap[]).filter((g) => g.refresh_reason === 'no_amenities'),
        lastRun: (lastRun.data ?? null) as AmenityLastRun | null,
      };
    },
    staleTime: 60_000,
  });
}
