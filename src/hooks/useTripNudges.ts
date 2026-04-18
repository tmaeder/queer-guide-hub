import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TripNudge {
  id: string;
  trip_id: string;
  kind: 'event_overlap' | 'news_alert' | 'document_expiry' | 'weather_warning' | 'booking_reminder';
  dedupe_key: string;
  title: string;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
}

/**
 * Active (non-dismissed) nudges for a trip, newest first.
 */
export function useTripNudges(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-nudges', tripId],
    enabled: !!tripId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TripNudge[]> => {
      const { data, error } = await supabase
        .from('trip_nudges')
        .select('*')
        .eq('trip_id', tripId!)
        .is('dismissed_at', null)
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TripNudge[];
    },
  });
}

export function useDismissTripNudge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; tripId: string }) => {
      const { error } = await supabase
        .from('trip_nudges')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-nudges', vars.tripId] });
    },
  });
}

/**
 * Manual scan trigger — fires the `trip-nudges` edge function for
 * this trip so nudges refresh after the user edits the itinerary.
 */
export function useScanTripNudges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId }: { tripId: string }) => {
      const { error } = await supabase.functions.invoke('trip-nudges', {
        body: { trip_id: tripId },
      });
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-nudges', vars.tripId] });
    },
  });
}
