import { useMemo } from 'react';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import {
  useMarketplaceListingsForCity,
  useMarketplaceListingsForOccasion,
} from '@/hooks/useMarketplaceQueries';
import { occasionForEvent } from './marketplaceHelpers';
import type { TripPlace } from '@/hooks/useTrips';

interface MarketplaceForTripProps {
  cityName: string | null;
  places: TripPlace[];
  limit?: number;
}

/**
 * Destination gear rail inside the trip Packing tools: venue-hosted
 * listings from the primary destination city, topped up with occasion
 * gear when the itinerary contains a pride/drag/wedding event.
 * Self-hides when both buckets are empty.
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

  const { data: local, loading: localLoading } = useMarketplaceListingsForCity(
    cityName ?? undefined,
    6,
  );
  const { data: occasion, loading: occLoading } = useMarketplaceListingsForOccasion(
    occ ?? undefined,
    6,
  );

  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged = [];
    for (const l of [...local, ...occasion]) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      merged.push(l);
    }
    return merged.slice(0, limit);
  }, [local, occasion, limit]);

  if (localLoading || occLoading || items.length === 0) return null;

  return (
    <MarketplaceRailShell
      id="trip-gear"
      title={cityName ? `Gear for ${cityName}` : 'Gear for this trip'}
      subtitle={occ ? 'Local finds and occasion picks from the marketplace.' : 'Local finds from the marketplace.'}
      listings={items}
      loading={false}
      surface="trip_gear"
      className="mt-8 mb-0"
    />
  );
}
