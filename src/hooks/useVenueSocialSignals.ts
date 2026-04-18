import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface VenueSocialSignal {
  venue_id: string;
  friends_saved: number;
  trip_usage: number;
}

/**
 * Fetch social-proof counts for a batch of venue IDs in one RPC call.
 * Returns a Map<venue_id, VenueSocialSignal> for O(1) lookup when
 * rendering a list. Anonymous viewers still get `trip_usage` (public
 * trips only), just no friend counts.
 *
 * Cached for 5 minutes — these change slowly and stale counts are fine.
 */
export function useVenueSocialSignals(venueIds: string[] | undefined) {
  const { user } = useAuth();
  const ids = (venueIds ?? []).filter(Boolean).sort();
  const key = ids.join(',');

  return useQuery({
    queryKey: ['venue-social-signals', key, user?.id ?? 'anon'],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, VenueSocialSignal>> => {
      const { data, error } = await supabase.rpc('get_venue_social_signals', {
        p_venue_ids: ids,
        p_viewer_id: user?.id ?? null,
      });
      if (error) throw error;
      const out = new Map<string, VenueSocialSignal>();
      for (const row of (data ?? []) as VenueSocialSignal[]) {
        out.set(row.venue_id, row);
      }
      return out;
    },
  });
}
