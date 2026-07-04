import { useMemo } from 'react';
import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplaceSimilarListings } from '@/hooks/useMarketplaceQueries';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'] & {
  venues?: { name: string; address: string; city: string } | null;
};

interface Props {
  listing: MarketplaceListing;
  limit?: number;
  title?: string;
}

export function MarketplaceSimilarItems({ listing, limit = 4, title = 'Similar items' }: Props) {
  const { data: items, loading } = useMarketplaceSimilarListings(listing, limit);
  const { assets } = useEntityImageAssets('marketplace_listing', useMemo(() => items.map((i) => i.id), [items]));

  if (!loading && items.length === 0) return null;

  return (
    <section aria-labelledby="similar-items" className="mt-10">
      <h2 id="similar-items" className="font-display text-headline-lg tracking-tight mb-4">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: limit }).map((_, i) => <MarketplaceCard key={i} loading />)
          : items.map((it) => <MarketplaceCard key={it.id} listing={it} imageAsset={assets.get(it.id)} />)}
      </div>
    </section>
  );
}
