import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplaceListingsForCountry } from '@/hooks/useMarketplaceQueries';

/**
 * Editorial marketplace strip for CountryDetail. Mirrors MarketplaceForCity
 * but joins through venues.country_id rather than venues.city, so any venue
 * in the country contributes. Renders nothing on empty result so the
 * surrounding section collapses cleanly.
 */
export function MarketplaceForCountry({
  countryId,
  countryName,
  limit = 4,
}: {
  countryId: string;
  countryName: string;
  limit?: number;
}) {
  const { data: items, loading } = useMarketplaceListingsForCountry(countryId, limit);
  if (loading || items.length === 0) return null;
  return (
    <section aria-labelledby="country-marketplace" className="mt-8">
      <h2 id="country-marketplace" className="mb-4 text-xl font-bold tracking-tight">
        From the marketplace in {countryName}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <MarketplaceCard key={it.id} listing={it} />
        ))}
      </div>
    </section>
  );
}
