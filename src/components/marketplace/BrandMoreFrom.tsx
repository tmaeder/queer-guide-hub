import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowRight } from 'lucide-react';
import { MarketplaceCard } from './MarketplaceCard';
import { useBrandMoreFrom } from '@/hooks/useMarketplaceBrands';
import { brandSlug } from '@/lib/marketplaceTaxonomy';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

/** 4-up "More from {brand}" on the listing detail page. */
export function BrandMoreFrom({ listing }: { listing: MarketplaceListing }) {
  const { data: items = [] } = useBrandMoreFrom(listing.brand, listing.id);
  const slug = brandSlug(listing.brand);

  if (!listing.brand || items.length === 0) return null;

  return (
    <section aria-label={`More from ${listing.brand}`} className="mt-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-title font-semibold">More from {listing.brand}</h2>
        {slug && (
          <LocalizedLink
            to={`/marketplace/brands/${slug}`}
            className="inline-flex items-center gap-1 text-13 font-medium hover:underline"
          >
            All from {listing.brand}
            <ArrowRight size={14} aria-hidden="true" />
          </LocalizedLink>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((l) => (
          <MarketplaceCard key={l.id} listing={l} surface="marketplace_detail" />
        ))}
      </div>
    </section>
  );
}
