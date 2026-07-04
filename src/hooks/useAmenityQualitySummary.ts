import { supabase } from '@/integrations/supabase/client';
import { createQualitySummaryHook } from '@/hooks/quality/createQualitySummaryHook';

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

const live = () =>
  supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .is('duplicate_of_id', null)
    .is('closed_at', null);

/** Health summary for the Amenity Truth Engine — live counts (no gaps table). */
export const useAmenityQualitySummary = createQualitySummaryHook({
  queryKey: 'amenity-quality-summary',
  metrics: {
    total: { kind: 'count', build: () => live() },
    withAmenities: { kind: 'count', build: () => live().neq('amenities', '{}') },
    withAccessibility: { kind: 'count', build: () => live().neq('accessibility_attributes', '{}') },
    needsAttention: { kind: 'count', build: () => live().eq('needs_attention', true) },
    reviewOpen: {
      kind: 'count',
      build: () =>
        supabase.from('venue_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    },
    gaps: {
      kind: 'rows',
      build: () => supabase.rpc('venues_due_for_amenity_backfill', { p_limit: 10 }),
    },
    lastRun: {
      kind: 'single',
      build: () =>
        supabase
          .from('admin_automation_runs')
          .select('finished_at, status, items_examined, summary')
          .eq('automation_slug', 'amenity_truth_backfill')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
    },
  },
  reshape: (r): AmenityQualitySummary => ({
    total: r.total,
    withAmenities: r.withAmenities,
    withAccessibility: r.withAccessibility,
    noAmenities: r.total - r.withAmenities,
    needsAttention: r.needsAttention,
    reviewOpen: r.reviewOpen,
    gaps: (r.gaps as AmenityCoverageGap[]).filter((g) => g.refresh_reason === 'no_amenities'),
    lastRun: r.lastRun as AmenityLastRun | null,
  }),
});
