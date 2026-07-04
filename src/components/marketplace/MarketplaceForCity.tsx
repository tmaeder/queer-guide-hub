import { useMemo } from 'react';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import {
  useCityUpcomingOccasion,
  useMarketplaceListingsForCity,
  useMarketplaceListingsForOccasion,
} from '@/hooks/useMarketplaceQueries';

const OCCASION_SUBTITLES: Record<string, (city: string) => string> = {
  'occ-pride': (city) => `Pride is coming to ${city}.`,
  'occ-drag': (city) => `Drag nights ahead in ${city}.`,
  'occ-wedding': (city) => `Wedding season in ${city}.`,
};

/**
 * City marketplace rail: venue-hosted "local" listings first, topped up
 * with online occasion gear when the city has an upcoming pride/drag/
 * wedding event. Self-hides when both buckets are empty.
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
  const { data: local, loading: localLoading } = useMarketplaceListingsForCity(cityName, 6);
  const { data: occ } = useCityUpcomingOccasion(cityId);
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

  const occasionContributed = occ && occasion.length > 0;

  return (
    <MarketplaceRailShell
      id="city-marketplace"
      title={`From the marketplace in ${cityName}`}
      subtitle={occasionContributed ? OCCASION_SUBTITLES[occ]?.(cityName) : undefined}
      listings={items}
      loading={false}
      surface="city_rail"
      className="mt-8 mb-0"
    />
  );
}
