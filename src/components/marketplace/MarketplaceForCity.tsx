import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplaceListingsForCity } from '@/hooks/useMarketplaceQueries';

export function MarketplaceForCity({ cityName, limit = 4 }: { cityName: string; limit?: number }) {
  const { data: items, loading } = useMarketplaceListingsForCity(cityName, limit);
  if (loading || items.length === 0) return null;
  return (
    <section aria-labelledby="city-marketplace" className="mt-8">
      <h2 id="city-marketplace" className="text-xl font-bold tracking-tight mb-4">
        From the marketplace in {cityName}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <MarketplaceCard key={it.id} listing={it} />
        ))}
      </div>
    </section>
  );
}
