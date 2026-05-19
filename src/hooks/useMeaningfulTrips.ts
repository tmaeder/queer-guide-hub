import { useMemo } from 'react';
import { useTrips, type TripListItem } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { isMeaningfulTrip } from '@/components/trips/tripsFilters';

/**
 * Trips the user has invested in: a place, dates, or a custom title.
 * Drops empty stubs (legacy "Trip to X" rows with no content).
 */
export function useMeaningfulTrips(): TripListItem[] {
  const { user } = useAuth();
  const { data: trips } = useTrips();
  return useMemo(() => {
    if (!user) return [];
    return (trips ?? [])
      .filter((trip) => trip.status === 'planning' || trip.status === 'active')
      .filter(isMeaningfulTrip);
  }, [user, trips]);
}

export function useHasMeaningfulActiveTrip(): boolean {
  return useMeaningfulTrips().length > 0;
}

/**
 * The trip we'd link to from /travel when the user explicitly asks for
 * planning (e.g. legacy `?mode=plan` deep link). Looser than
 * `pickDefaultTrip` from useActiveTrip — that one only fires for
 * live/countdown trips. This one picks the first meaningful trip so
 * bookmarked deep links always land somewhere useful.
 */
export function usePrimaryMeaningfulTrip(): TripListItem | null {
  const trips = useMeaningfulTrips();
  return trips[0] ?? null;
}
