import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TripBookingClick {
  id: string;
  trip_id: string;
  trip_place_id: string | null;
  user_id: string | null;
  provider: string;
  vertical: 'hotel' | 'activity' | 'flight' | 'restaurant' | 'other';
  destination_url: string;
  clicked_at: string;
}

export interface TripBookingClickSummary {
  total: number;
  byVertical: Record<TripBookingClick['vertical'], number>;
  byProvider: Record<string, number>;
  recent: TripBookingClick[];
}

/**
 * Owner/editor-only view of affiliate-link click history for a trip.
 * RLS on `trip_booking_clicks_select` limits visibility to
 * owner + editor roles; other members get an empty array.
 */
export function useTripBookingClicks(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-booking-clicks', tripId],
    enabled: !!tripId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TripBookingClickSummary> => {
      const { data, error } = await supabase
        .from('trip_booking_clicks')
        .select('*')
        .eq('trip_id', tripId!)
        .order('clicked_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as TripBookingClick[];
      const byVertical: TripBookingClickSummary['byVertical'] = {
        hotel: 0,
        activity: 0,
        flight: 0,
        restaurant: 0,
        other: 0,
      };
      const byProvider: Record<string, number> = {};
      for (const r of rows) {
        byVertical[r.vertical] = (byVertical[r.vertical] ?? 0) + 1;
        byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;
      }
      return {
        total: rows.length,
        byVertical,
        byProvider,
        recent: rows.slice(0, 5),
      };
    },
  });
}
