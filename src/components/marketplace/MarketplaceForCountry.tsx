import { MarketplaceRailShell } from './MarketplaceRailShell';
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
  limit = 10,
}: {
  countryId: string;
  countryName: string;
  limit?: number;
}) {
  const { data: items, loading } = useMarketplaceListingsForCountry(countryId, limit);
  if (loading || items.length === 0) return null;
  return (
    <MarketplaceRailShell
      id="country-marketplace"
      title={`From the marketplace in ${countryName}`}
      listings={items}
      loading={false}
      surface="city_rail"
      className="mt-8 mb-0"
    />
  );
}
