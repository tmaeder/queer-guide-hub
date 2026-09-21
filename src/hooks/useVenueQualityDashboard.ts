import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface VenueQualityDashboard {
  enforcement_enabled: boolean;
  score_version: number;
  live_venues: number;
  snapshots: number;
  stale_snapshots: number;
  pending_recompute: number;
  tiers: Record<string, number>;
  average_dimensions: Record<string, number | null>;
  blockers: Array<{ code: string; count: number }>;
  source_cohorts: Array<{
    source: string;
    total: number;
    promoted: number;
    average_score: number | null;
  }>;
  city_gaps: Array<{ city: string; listed: number; promoted: number }>;
  weekly_transitions: Record<string, number>;
}

/** Versioned venue quality health. Detailed evidence remains server/admin-only. */
export function useVenueQualityDashboard() {
  return useQuery({
    queryKey: ['venue-quality-dashboard-v2'],
    queryFn: async (): Promise<VenueQualityDashboard> => {
      const { data, error } = await untypedRpc<VenueQualityDashboard>('venue_quality_dashboard');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Venue quality dashboard returned no data');
      return data;
    },
    staleTime: 60_000,
  });
}
