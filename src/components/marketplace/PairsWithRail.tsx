import { useEffect, useState } from 'react';
import { fetchSimilar } from '@/lib/searchClient';
import { useMarketplaceListingsByIds } from '@/hooks/useMarketplaceListingsByIds';
import { isAdultListing } from '@/hooks/useAdultContent';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import { MarketplaceSimilarItems } from './MarketplaceSimilarItems';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'] & {
  venues?: { name: string; address: string; city: string } | null;
};

/**
 * "Pairs with" — embedding-based related products via the search-proxy
 * /similar endpoint, hydrated to full rows for real cards. Falls back to
 * the tag/category heuristic (MarketplaceSimilarItems) when the worker
 * has nothing.
 */
export function PairsWithRail({ listing }: { listing: MarketplaceListing }) {
  const [ids, setIds] = useState<string[] | null>(null);

  // Reset to the loading state during render when the listing changes, so the
  // fetch effect below never has to setState synchronously (which would
  // trigger a cascading render). This is React's "adjust state on prop change
  // during render" pattern. See react-hooks/set-state-in-effect.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (loadedFor !== listing.id) {
    setLoadedFor(listing.id);
    setIds(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetchSimilar({ type: 'marketplace', id: listing.id }, 8, ['marketplace'])
      .then((hits) => {
        if (cancelled) return;
        setIds(hits.map((h) => h.id).filter((id) => id && id !== listing.id));
      })
      .catch(() => {
        if (!cancelled) setIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  const { data: rows, loading } = useMarketplaceListingsByIds(ids ?? []);
  // Default-safe: an SFW listing never suggests adult companions.
  const items = isAdultListing(listing) ? rows : rows.filter((r) => !isAdultListing(r));

  // Worker had nothing (or errored) → tag/category heuristic fallback.
  if (ids != null && ids.length === 0) {
    return <MarketplaceSimilarItems listing={listing} title="Pairs with" />;
  }
  if (ids != null && !loading && items.length === 0) {
    return <MarketplaceSimilarItems listing={listing} title="Pairs with" />;
  }

  return (
    <MarketplaceRailShell
      id="pairs-with"
      title="Pairs with"
      listings={items}
      loading={ids == null || loading}
      surface="marketplace_detail"
    />
  );
}
