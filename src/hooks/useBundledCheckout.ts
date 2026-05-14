import { supabase } from '@/integrations/supabase/client';

export async function fetchTripDateRange(
  tripId: string,
): Promise<{ start_date: string | null; end_date: string | null } | null> {
  const { data } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('id', tripId)
    .maybeSingle();
  return (data as { start_date: string | null; end_date: string | null } | null) ?? null;
}

export interface TripPlaceCity {
  city_id: string | null;
  cities: { id: string; name: string } | null;
}

export async function fetchTripPlaceCities(tripId: string): Promise<TripPlaceCity[]> {
  const { data } = await supabase
    .from('trip_places')
    .select('city_id, cities(id, name)')
    .eq('trip_id', tripId);
  return (data ?? []) as TripPlaceCity[];
}

export async function logTripBookingClick(payload: {
  trip_id: string;
  trip_place_id: string | null;
  user_id: string | null;
  provider: string;
  vertical: string;
  destination_url: string;
}): Promise<void> {
  await supabase.from('trip_booking_clicks').insert(payload);
}
