import { useMemo } from 'react';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import {
  useCityUpcomingOccasion,
  useMarketplaceListingsForOccasion,
} from '@/hooks/useMarketplaceQueries';

const OCCASION_SUBTITLES: Record<string, (city: string) => string> = {
  'occ-pride': (city) => `Pride is coming to ${city}.`,
  'occ-drag': (city) => `Drag nights ahead in ${city}.`,
  'occ-wedding': (city) => `Wedding season in ${city}.`,
};

/**
 * City marketplace rail: occasion gear for the city's next pride/drag/
 * wedding event. Self-hides when there is no upcoming occasion.
 *
 * This used to lead with "local" listings hosted by venues in the city.
 * That half was removed because it could never return a row:
 * `marketplace_listings.venue_id` is NULL on all 70,206 rows, and the query
 * joined `venues!inner`, so the result set was empty by construction — and
 * the hook swallowed the error, so the rail rendered nothing either way.
 * Restoring it means populating `venue_id` first, not re-adding the query.
 */
export function MarketplaceForCity({
  cityName,
  cityId,
  limit = 10,
}: {
  cityName: string;
  cityId?: string;
  limit?: number;
}) {
  const { data: occ } = useCityUpcomingOccasion(cityId);
  const { data: occasion, loading } = useMarketplaceListingsForOccasion(occ ?? undefined, 6);

  const items = useMemo(() => occasion.slice(0, limit), [occasion, limit]);

  if (loading || items.length === 0) return null;

  return (
    <MarketplaceRailShell
      id="city-marketplace"
      title={`From the marketplace in ${cityName}`}
      subtitle={occ ? OCCASION_SUBTITLES[occ]?.(cityName) : undefined}
      listings={items}
      loading={false}
      surface="city_rail"
      className="mt-8 mb-0"
    />
  );
}
