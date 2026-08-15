import type { Database } from '@/integrations/supabase/types';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import { useBrandMoreFrom } from '@/hooks/useMarketplaceBrands';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

/**
 * "From the same brand" rail on the listing detail page.
 *
 * `curatedName` is `marketplace_brands.display_name`; without it this heading
 * reads "More from tomboyx" on a page whose maker block says "TomboyX". The
 * QUERY still keys off `listing.brand` — `useBrandMoreFrom` derives
 * `brand_key` from it, and the curated name is a label, not a lookup key.
 */
export function BrandMoreFrom({
  listing,
  curatedName,
}: {
  listing: MarketplaceListing;
  curatedName?: string | null;
}) {
  const { data: items = [], isLoading } = useBrandMoreFrom(listing.brand, listing.id, 8);

  if (!listing.brand || (!isLoading && items.length === 0)) return null;

  return (
    <MarketplaceRailShell
      id="brand-more-from"
      title={`More from ${curatedName || listing.brand}`}
      listings={items}
      loading={isLoading}
      surface="marketplace_detail"
    />
  );
}
