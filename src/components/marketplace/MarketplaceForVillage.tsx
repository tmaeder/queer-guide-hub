import { MarketplaceForCity } from './MarketplaceForCity';

/**
 * Editorial marketplace strip for QueerVillageDetail. A village always sits
 * inside a parent city — we surface that parent city's marketplace items
 * rather than try to scope to the village footprint itself (which would be
 * empty for most rows). Thin wrapper to keep the call-site clean.
 */
export function MarketplaceForVillage({
  parentCityName,
  limit = 4,
}: {
  parentCityName: string | null | undefined;
  limit?: number;
}) {
  if (!parentCityName) return null;
  return <MarketplaceForCity cityName={parentCityName} limit={limit} />;
}
