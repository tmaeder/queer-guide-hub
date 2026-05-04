import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface EntityTripStatus {
  isInTrip: boolean;
  tripNames: string[];
  tripIds: string[];
  count: number;
}

const emptyStatus: EntityTripStatus = {
  isInTrip: false,
  tripNames: [],
  tripIds: [],
  count: 0,
};

interface TripPlaceRow {
  trip_id: string;
  venue_id: string | null;
  event_id: string | null;
  hotel_id: string | null;
  trips: { id: string; title: string } | null;
}

// Single query per user: fetch every trip_place across every trip the user
// is an accepted member of. React-query dedupes by queryKey across all
// useEntityTripStatus call sites in the page (one per card), so a 24-card
// /events grid issues 1 trip_members + 1 trip_places fetch instead of 24.
function useUserTripPlaces() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-trip-places', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TripPlaceRow[]> => {
      const { data: memberRows, error: memberErr } = await supabase
        .from('trip_members')
        .select('trip_id')
        .eq('user_id', user!.id)
        .not('accepted_at', 'is', null);
      if (memberErr) throw memberErr;
      const tripIds = memberRows?.map((m) => m.trip_id) ?? [];
      if (tripIds.length === 0) return [];

      const { data: places, error: placesErr } = await supabase
        .from('trip_places')
        .select('trip_id, venue_id, event_id, hotel_id, trips:trip_id(id, title)')
        .in('trip_id', tripIds);
      if (placesErr) throw placesErr;
      return (places ?? []) as unknown as TripPlaceRow[];
    },
  });
}

export function useEntityTripStatus(
  entityType: 'venue' | 'event' | 'hotel',
  entityId: string | undefined,
) {
  const { data: places, isLoading, error } = useUserTripPlaces();

  const column =
    entityType === 'venue'
      ? 'venue_id'
      : entityType === 'event'
        ? 'event_id'
        : 'hotel_id';

  const data: EntityTripStatus = (() => {
    if (!entityId || !places || places.length === 0) return emptyStatus;
    const matches = places.filter((p) => p[column] === entityId);
    if (matches.length === 0) return emptyStatus;
    const uniqueTrips = new Map<string, string>();
    for (const place of matches) {
      const trip = place.trips;
      if (trip && !uniqueTrips.has(trip.id)) {
        uniqueTrips.set(trip.id, trip.title);
      }
    }
    return {
      isInTrip: uniqueTrips.size > 0,
      tripNames: Array.from(uniqueTrips.values()),
      tripIds: Array.from(uniqueTrips.keys()),
      count: uniqueTrips.size,
    };
  })();

  return { data, isLoading, error };
}
