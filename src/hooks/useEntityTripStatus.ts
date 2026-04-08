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

export function useEntityTripStatus(
  entityType: 'venue' | 'event' | 'hotel',
  entityId: string | undefined,
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['entity-trip-status', entityType, entityId, user?.id],
    queryFn: async (): Promise<EntityTripStatus> => {
      // Get trips where user is a member
      const { data: memberRows, error: memberErr } = await supabase
        .from('trip_members')
        .select('trip_id')
        .eq('user_id', user!.id)
        .not('accepted_at', 'is', null);

      if (memberErr) throw memberErr;
      const tripIds = memberRows?.map((m) => m.trip_id) || [];
      if (tripIds.length === 0) return emptyStatus;

      // Build the column filter based on entity type
      const column =
        entityType === 'venue'
          ? 'venue_id'
          : entityType === 'event'
            ? 'event_id'
            : 'hotel_id';

      const { data: places, error: placesErr } = await supabase
        .from('trip_places')
        .select('trip_id, trips:trip_id(id, title)')
        .eq(column, entityId!)
        .in('trip_id', tripIds);

      if (placesErr) throw placesErr;
      if (!places || places.length === 0) return emptyStatus;

      // Deduplicate by trip_id
      const uniqueTrips = new Map<string, string>();
      for (const place of places) {
        const trip = place.trips as unknown as { id: string; title: string } | null;
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
    },
    enabled: !!entityId && !!user,
    staleTime: 5 * 60 * 1000,
    placeholderData: emptyStatus,
  });
}
