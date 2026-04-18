import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TripRecapHighlights {
  top_places: string[];
  cities: string[];
  countries: string[];
  place_count: number;
  day_count: number | null;
  total_spent: { currency: string; amount: number }[];
  favourite_day?: { date: string; names: string[] };
}

export interface TripRecap {
  trip_id: string;
  summary: string;
  highlights: TripRecapHighlights;
  generated_at: string;
  generated_by: string | null;
}

/**
 * Post-trip recap reader. Returns null when no recap has been
 * generated yet — the caller can show a "Generate recap" CTA that
 * invokes {@link useGenerateTripRecap}.
 */
export function useTripRecap(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-recap', tripId],
    queryFn: async (): Promise<TripRecap | null> => {
      const { data, error } = await supabase
        .from('trip_recaps')
        .select('*')
        .eq('trip_id', tripId!)
        .maybeSingle();
      if (error) throw error;
      return (data as TripRecap | null) ?? null;
    },
    enabled: !!tripId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Generate (or refresh) the recap via the `trip-recap` edge function.
 * Invalidates the `trip-recap` query on success so the new summary
 * paints immediately.
 */
export function useGenerateTripRecap(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { refresh?: boolean }): Promise<TripRecap> => {
      const { data, error } = await supabase.functions.invoke('trip-recap', {
        body: { trip_id: tripId, refresh: !!opts?.refresh },
      });
      if (error) throw error;
      return data as TripRecap;
    },
    onSuccess: (data) => {
      qc.setQueryData(['trip-recap', tripId], data);
    },
  });
}
