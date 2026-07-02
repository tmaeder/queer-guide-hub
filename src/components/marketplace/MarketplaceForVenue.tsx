import { useMemo } from 'react';
import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplaceListingsForVenue } from '@/hooks/useMarketplaceQueries';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';

interface Props {
  venueId: string;
  limit?: number;
  title?: string;
}

export function MarketplaceForVenue({ venueId, limit = 4, title = 'Shop from this venue' }: Props) {
  const { data: items, loading } = useMarketplaceListingsForVenue(venueId, limit);
  const { assets } = useEntityImageAssets('marketplace_listing', useMemo(() => items.map((i) => i.id), [items]));

  if (!loading && items.length === 0) return null;
  if (loading) return null;

  return (
    <section aria-labelledby="venue-marketplace" className="mt-8">
      <h2 id="venue-marketplace" className="text-xl font-bold tracking-tight mb-4">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <MarketplaceCard key={it.id} listing={it} imageAsset={assets.get(it.id)} surface="city_rail" />
        ))}
      </div>
    </section>
  );
}
