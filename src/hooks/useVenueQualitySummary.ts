import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VenueCoverageGap {
  city: string;
  thin_count: number;
}

export interface VenueQualitySummary {
  liveVenues: number;
  avgCompleteness: number;
  avgStoredQuality: number;
  missing: {
    images: number;
    hours: number;
    tags: number;
    category: number;
    description: number;
    phone_email: number;
    website: number;
    coords: number;
  };
  needsAttention: number;
  neverRefreshed: number;
  relevanceNull: number;
  staleQualityScore: number;
  coverageGaps: VenueCoverageGap[];
  dbMb: number;
  dbHeadroomMb: number;
}

/** Live venue content-quality summary (field coverage + regression KPIs + DB headroom). */
export function useVenueQualitySummary() {
  return useQuery<VenueQualitySummary>({
    queryKey: ['venue-quality-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('venue_quality_stats' as never);
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      const m = (d.missing ?? {}) as Record<string, number>;
      return {
        liveVenues: Number(d.live_venues ?? 0),
        avgCompleteness: Number(d.avg_completeness ?? 0),
        avgStoredQuality: Number(d.avg_stored_quality ?? 0),
        missing: {
          images: Number(m.images ?? 0),
          hours: Number(m.hours ?? 0),
          tags: Number(m.tags ?? 0),
          category: Number(m.category ?? 0),
          description: Number(m.description ?? 0),
          phone_email: Number(m.phone_email ?? 0),
          website: Number(m.website ?? 0),
          coords: Number(m.coords ?? 0),
        },
        needsAttention: Number(d.needs_attention ?? 0),
        neverRefreshed: Number(d.never_refreshed ?? 0),
        relevanceNull: Number(d.relevance_null ?? 0),
        staleQualityScore: Number(d.stale_quality_score ?? 0),
        coverageGaps: (d.coverage_gaps ?? []) as VenueCoverageGap[],
        dbMb: Number(d.db_mb ?? 0),
        dbHeadroomMb: Number(d.db_headroom_mb ?? 0),
      };
    },
    staleTime: 60_000,
  });
}
