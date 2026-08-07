import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTrip } from './useActiveTrip';
import { usePrimaryMeaningfulTrip } from './useMeaningfulTrips';
import type { TripListItem } from './useTrips';

export interface TripBookingContext {
  tripId: string;
  tripTitle: string | null;
  cityName: string | null;
  /** trip.start_date / end_date, YYYY-MM-DD. */
  checkIn: string | null;
  checkOut: string | null;
  destinationIata: string | null;
  destinationLabel: string | null;
}

/** Exported for tests: a finished trip must never seed a booking search. */
export function pickBookableTrip(
  active: TripListItem | null,
  primary: TripListItem | null,
  today = new Date().toISOString().slice(0, 10),
): TripListItem | null {
  const trip = active ?? primary;
  if (!trip) return null;
  if (trip.end_date && trip.end_date < today) return null;
  return trip;
}

/**
 * The signed-in user's current trip as booking-search context: destination
 * city + dates + the city's primary airport. BookNowAccordion seeds its
 * flight/hotel/activity forms from this (URL params always win). Null for
 * signed-out users, no meaningful trip, or a trip already over.
 */
export function useTripBookingContext(): TripBookingContext | null {
  const { activeTrip } = useActiveTrip();
  const primary = usePrimaryMeaningfulTrip();
  const trip = pickBookableTrip(activeTrip, primary);

  const cityId = trip?.primary_city_id ?? null;
  const { data: city } = useQuery({
    queryKey: ['trip-booking-airport', cityId],
    enabled: !!cityId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('cities')
        .select('name, major_airport_code')
        .eq('id', cityId!)
        .maybeSingle();
      return (data ?? null) as { name: string; major_airport_code: string | null } | null;
    },
  });

  if (!trip) return null;
  const cityName = trip.primary_city_name ?? city?.name ?? null;
  return {
    tripId: trip.id,
    tripTitle: trip.title ?? null,
    cityName,
    checkIn: trip.start_date ?? null,
    checkOut: trip.end_date ?? null,
    destinationIata: city?.major_airport_code ?? null,
    destinationLabel: city?.major_airport_code ? cityName : null,
  };
}
