import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PeopleHereRail } from '@/components/people/PeopleHereRail';
import { useTripSafety } from '@/hooks/useTripSafety';
import type { TripWithDetails } from '@/hooks/useTrips';

interface Props {
  trip: TripWithDetails;
}

/**
 * "Travel buddies for this trip" — the place-anchored people rail, gated by the
 * outing-safety invariant. The rail surfaces live users who are currently
 * heading to the trip's city; showing that for a destination where being LGBTQ+
 * is criminalized (or carries the death penalty) is exactly the exposure the
 * rest of the product is engineered to prevent (see compose_safety_note /
 * approve_city_review). For those destinations the surface simply does not
 * exist — no rail, no header — mirroring how suppression works elsewhere.
 */
export function TravelBuddiesSection({ trip }: Props) {
  const { t } = useTranslation();

  const countryIds = useMemo(() => {
    const ids = new Set<string>();
    if (trip.primary_country_id) ids.add(trip.primary_country_id);
    for (const p of trip.trip_places) if (p.country_id) ids.add(p.country_id);
    return Array.from(ids);
  }, [trip.primary_country_id, trip.trip_places]);

  const safety = useTripSafety(countryIds);

  // Suppress entirely for criminalizing / death-penalty destinations.
  if (safety.hasCriminalizedDestination || safety.hasDeathPenaltyDestination) return null;

  return (
    <div className="mt-8">
      <PeopleHereRail
        mode="travel"
        tripId={trip.id}
        title={t('trips.travelBuddies.title', 'Travel buddies for this trip')}
        seeAllHref="/people/travel"
      />
    </div>
  );
}
