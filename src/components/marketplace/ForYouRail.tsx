import { useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useCuratedIds } from '@/components/marketplace/useCuratedIds';
import { usePersonalizedMarketplaceListings } from '@/hooks/usePersonalizedMarketplace';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Info } from 'lucide-react';

/**
 * "Picked for you" rail. Surfaced only when the user has enough save
 * signal for the RPC to produce results. Hidden silently otherwise so
 * cold-start users don't see an empty section staring back at them.
 *
 * Future iterations will pull from `user_recommendations` (cached
 * server-side ranking) instead of computing live. For now the RPC is
 * cheap enough to call on every page load.
 */
const REASON_LABELS: Record<string, string> = {
  tag_overlap: 'Because you saved similar items',
  follows: 'Because you follow this tag',
  interests: 'From your interests',
};

export function ForYouRail() {
  const { user } = useAuth();
  const { register } = useCuratedIds();
  const { listings, reasons, loading } = usePersonalizedMarketplaceListings(user?.id, 12);

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
              Based on items you've saved, tags you follow, and your profile
              interests. As you save more, this row gets closer to your taste.
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
                surface="for_you"
              />
              {reasons.get(l.id) && (
                <p className="mt-1 text-2xs uppercase tracking-wider text-muted-foreground">
                  {REASON_LABELS[reasons.get(l.id)!]}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
