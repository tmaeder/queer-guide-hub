import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useCuratedIds } from '@/components/marketplace/useCuratedIds';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Info } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

/**
 * "Picked for you" rail. Surfaced only when the user has enough save
 * signal for the RPC to produce results. Hidden silently otherwise so
 * cold-start users don't see an empty section staring back at them.
 *
 * Future iterations will pull from `user_recommendations` (cached
 * server-side ranking) instead of computing live. For now the RPC is
 * cheap enough to call on every page load.
 */
export function ForYouRail() {
  const { user } = useAuth();
  const { register } = useCuratedIds();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setListings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ranks, error } = await supabase.rpc(
        'get_personalized_marketplace_listings',
        { p_user_id: user.id, p_limit: 12 },
      );
      if (cancelled || error || !ranks || ranks.length === 0) {
        if (!cancelled) {
          setListings([]);
          setLoading(false);
        }
        return;
      }
      type Rank = { listing_id: string; score: number; reason: string };
      const ids = (ranks as Rank[]).map((r) => r.listing_id);
      const { data: rows } = await supabase
        .from('marketplace_listings')
        .select('*, marketplace_reviews(rating), marketplace_favorites(id), venues(name, address, city)')
        .eq('status', 'active')
        .in('id', ids);
      if (cancelled) return;
      const byId = new Map((rows ?? []).map((r) => [r.id, r] as const));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as MarketplaceListing[];
      setListings(ordered);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Register these IDs so the main grid doesn't repeat them on page 1.
  useEffect(() => {
    if (listings.length > 0) register('for-you', listings.map((l) => l.id));
  }, [listings, register]);

  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);

  if (!user || loading || listings.length === 0) return null;

  return (
    <section className="mb-16">
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="text-13 uppercase tracking-wide text-muted-foreground mb-1">For you</p>
          <h2 className="text-headline font-semibold">Picked for you</h2>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              aria-label="Why am I seeing this?"
            >
              <Info size={14} aria-hidden="true" />
              Why?
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <p className="text-sm">
              Based on the items you've saved. As you save more, this row
              gets closer to your taste.
            </p>
          </PopoverContent>
        </Popover>
      </header>
      <div className="-mx-4 overflow-x-auto">
        <ul className="flex gap-6 px-4 pb-2 min-w-max">
          {listings.map((l, i) => (
            <li key={l.id} className="shrink-0 w-72">
              <MarketplaceCard
                listing={l}
                imageAsset={assets.get(l.id)}
                showFavoriteButton
                priority={i < 4}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
