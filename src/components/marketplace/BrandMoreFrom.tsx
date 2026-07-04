import type { Database } from '@/integrations/supabase/types';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import { useBrandMoreFrom } from '@/hooks/useMarketplaceBrands';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

/** "From the same brand" rail on the listing detail page. */
export function BrandMoreFrom({ listing }: { listing: MarketplaceListing }) {
  const { data: items = [], isLoading } = useBrandMoreFrom(listing.brand, listing.id, 8);

  if (!listing.brand || (!isLoading && items.length === 0)) return null;

  return (
    <MarketplaceRailShell
      id="brand-more-from"
      title={`More from ${listing.brand}`}
      listings={items}
      loading={isLoading}
      surface="marketplace_detail"
    />
  );
}
