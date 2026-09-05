import { useMemo } from 'react';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import { useMarketplaceListingsForOccasion } from '@/hooks/useMarketplaceQueries';
import { occasionForEvent } from './marketplaceHelpers';
import type { TripPlace } from '@/hooks/useTrips';

interface MarketplaceForTripProps {
  cityName: string | null;
  places: TripPlace[];
  limit?: number;
}

/**
 * Destination gear rail inside the trip Packing tools: occasion gear when the
 * itinerary contains a pride/drag/wedding event. Self-hides when there is none.
 *
 * The "local finds" half — listings hosted by venues in the destination city —
 * was removed because it could never return a row: `marketplace_listings.
 * venue_id` is NULL on all 70,206 rows and the query joined `venues!inner`.
 * See MarketplaceForCity for the same note.
 */
export function MarketplaceForTrip({ cityName, places, limit = 10 }: MarketplaceForTripProps) {
  // First matching occasion across itinerary events — one rail, not one per event.
  const occ = useMemo(() => {
    for (const p of places) {
      if (!p.events) continue;
      const match = occasionForEvent(p.events.event_type, p.events.title);
      if (match) return match;
    }
    return null;
  }, [places]);

  const { data: occasion, loading } = useMarketplaceListingsForOccasion(occ ?? undefined, 6);

  const items = useMemo(() => occasion.slice(0, limit), [occasion, limit]);

  if (loading || items.length === 0) return null;

  return (
    <MarketplaceRailShell
      id="trip-gear"
      title={cityName ? `Gear for ${cityName}` : 'Gear for this trip'}
      subtitle="Occasion picks from the marketplace."
      listings={items}
      loading={false}
      surface="trip_gear"
      className="mt-8 mb-0"
    />
  );
}
