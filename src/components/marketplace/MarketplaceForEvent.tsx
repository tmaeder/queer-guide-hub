import { MarketplaceRailShell } from './MarketplaceRailShell';
import { useMarketplaceListingsForOccasion } from '@/hooks/useMarketplaceQueries';
import { occasionForEvent } from './marketplaceHelpers';

const OCCASION_TITLES: Record<string, string> = {
  'occ-pride': 'Pride picks for this event',
  'occ-drag': 'Drag picks for this event',
  'occ-wedding': 'Wedding picks for this event',
};

export function MarketplaceForEvent({
  eventType,
  eventTitle,
  limit = 10,
}: {
  eventType: string | null | undefined;
  eventTitle: string;
  limit?: number;
}) {
  const occ = occasionForEvent(eventType, eventTitle);
  const { data: items, loading } = useMarketplaceListingsForOccasion(occ ?? undefined, limit);
  if (!occ || loading || items.length === 0) return null;
  return (
    <MarketplaceRailShell
      id="event-marketplace"
      title={OCCASION_TITLES[occ]}
      listings={items}
      loading={false}
      surface="event_rail"
      className="mb-0"
    />
  );
}
