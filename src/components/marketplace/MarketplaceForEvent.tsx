import { useMemo } from 'react';
import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplaceListingsForOccasion } from '@/hooks/useMarketplaceQueries';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';

/**
 * Map an event's type/title onto an occasion tag the tag engine mines onto
 * products. Deliberately narrow: only pride/drag/wedding shapes get a rail;
 * everything else renders nothing (no venue-type/weather/sentiment rails).
 */
export function occasionForEvent(eventType: string | null | undefined, title: string): string | null {
  const hay = `${eventType ?? ''} ${title}`.toLowerCase();
  if (/\bpride\b|\bcsd\b/.test(hay)) return 'occ-pride';
  if (/\bdrag\b|\bball(room)?\b/.test(hay)) return 'occ-drag';
  if (/\bwedding\b/.test(hay)) return 'occ-wedding';
  return null;
}

const OCCASION_TITLES: Record<string, string> = {
  'occ-pride': 'Pride picks for this event',
  'occ-drag': 'Drag picks for this event',
  'occ-wedding': 'Wedding picks for this event',
};

export function MarketplaceForEvent({
  eventType,
  eventTitle,
  limit = 8,
}: {
  eventType: string | null | undefined;
  eventTitle: string;
  limit?: number;
}) {
  const occ = occasionForEvent(eventType, eventTitle);
  const { data: items, loading } = useMarketplaceListingsForOccasion(occ ?? undefined, limit);
  const { assets } = useEntityImageAssets(
    'marketplace_listing',
    useMemo(() => items.map((i) => i.id), [items]),
  );
  if (!occ || loading || items.length === 0) return null;
  return (
    <section aria-labelledby="event-marketplace">
      <h2 id="event-marketplace" className="text-xl font-bold tracking-tight mb-4">
        {OCCASION_TITLES[occ]}
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((it) => (
          <MarketplaceCard key={it.id} listing={it} imageAsset={assets.get(it.id)} surface="event_rail" />
        ))}
      </div>
    </section>
  );
}
