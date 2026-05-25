import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface DestinationTarget {
  type: 'city' | 'country' | 'village';
  cityId?: string | null;
  countryId?: string | null;
  villageId?: string | null;
  /** Parent city id when type === 'village'. Used to detect trips touching the village's city. */
  parentCityId?: string | null;
}

export interface TripCovering {
  trip_id: string;
  trip_title: string;
  start_date: string | null;
  end_date: string | null;
  saved_count: number;
}

interface TripRow {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  primary_city_id: string | null;
  primary_country_id: string | null;
}

function targetMatchesTrip(target: DestinationTarget, trip: TripRow): boolean {
  if (target.type === 'city' && target.cityId) {
    return trip.primary_city_id === target.cityId;
  }
  if (target.type === 'country' && target.countryId) {
    return trip.primary_country_id === target.countryId;
  }
  if (target.type === 'village' && target.parentCityId) {
    return trip.primary_city_id === target.parentCityId;
  }
  return false;
}

/**
 * Detects the user's first trip that touches the given destination. Schema-safe:
 * uses the existing `trips.primary_city_id` / `primary_country_id` anchor today
 * and is intentionally tolerant if the `trip_destinations` table isn't live yet
 * (it isn't queried). Once destinations land we can JOIN to widen the net.
 */
export function useTripsCoveringDestination(target: DestinationTarget | null) {
  const { user } = useAuth();
  const enabled =
    !!user &&
    !!target &&
    Boolean(
      target.cityId ||
        target.countryId ||
        target.parentCityId ||
        target.villageId,
    );

  return useQuery<TripCovering | null>({
    queryKey: ['trips-covering-destination', user?.id, target],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user || !target) return null;
      const { data: members, error: memberErr } = await supabase
        .from('trip_members')
        .select('trip_id')
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null);
      if (memberErr) throw memberErr;
      const tripIds = members?.map((m) => m.trip_id) ?? [];
      if (tripIds.length === 0) return null;

      const { data: trips, error: tripsErr } = await supabase
        .from('trips')
        .select('id, title, start_date, end_date, primary_city_id, primary_country_id')
        .in('id', tripIds)
        .neq('status', 'archived')
        .order('start_date', { ascending: true, nullsFirst: false });
      if (tripsErr) throw tripsErr;

      const matching = (trips ?? []).filter((t) => targetMatchesTrip(target, t as TripRow));
      if (matching.length === 0) return null;

      // Prefer an upcoming or active trip; fall back to the first match.
      const today = new Date().toISOString().slice(0, 10);
      const upcoming =
        matching.find((t) => !t.end_date || t.end_date >= today) ?? matching[0];

      // Count saved trip_places for this trip whose city_id (or country_id) lines up.
      const cityToMatch = target.cityId ?? target.parentCityId ?? null;
      const countryToMatch = target.countryId ?? null;
      let saved = 0;
      if (cityToMatch || countryToMatch) {
        const query = supabase
          .from('trip_places')
          .select('trip_id', { count: 'exact', head: true })
          .eq('trip_id', upcoming.id);
        if (cityToMatch) query.eq('city_id', cityToMatch);
        else if (countryToMatch) query.eq('country_id', countryToMatch);
        const { count, error: countErr } = await query;
        // Silently tolerate the count failing — banner is best-effort.
        if (!countErr && typeof count === 'number') saved = count;
        else if (countErr && import.meta.env.DEV) {
          // Surface in dev only; never block the banner.
          console.warn('useTripsCoveringDestination count', countErr);
        }
      }

      return {
        trip_id: upcoming.id,
        trip_title: upcoming.title ?? '',
        start_date: upcoming.start_date,
        end_date: upcoming.end_date,
        saved_count: saved,
      };
    },
  });
}
