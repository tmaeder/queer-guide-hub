import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TripSafetyBriefing {
  trip_id: string;
  narrative: string;
  country_ids: string[];
  article_count: number;
  risk_level: 'low' | 'moderate' | 'high' | 'critical' | null;
  generated_at: string;
}

/**
 * Read-only: fetches the cached AI safety briefing if one exists.
 * RLS on `trip_safety_briefings_select` limits visibility to trip
 * owner / members / public-trip viewers.
 */
export function useTripSafetyBriefing(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-safety-briefing', tripId],
    enabled: !!tripId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TripSafetyBriefing | null> => {
      const { data, error } = await supabase
        .from('trip_safety_briefings')
        .select('*')
        .eq('trip_id', tripId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TripSafetyBriefing | null;
    },
  });
}

/**
 * Generate (or regenerate) the briefing. Server returns the cached
 * row if fresh (<7 days) and `refresh` is not set.
 */
export function useGenerateTripSafetyBriefing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, refresh }: { tripId: string; refresh?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('trip-safety-narrative', {
        body: { trip_id: tripId, refresh: !!refresh },
      });
      if (error) throw error;
      return data as TripSafetyBriefing;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-safety-briefing', vars.tripId] });
    },
  });
}
