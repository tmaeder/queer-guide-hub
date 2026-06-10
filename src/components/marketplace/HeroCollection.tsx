import { useMemo } from 'react';
import {
  useMarketplaceCollections,
  useMarketplaceCollectionListings,
} from '@/hooks/useMarketplaceCollections';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';

/**
 * Editorial hero block — one boutique-styled collection pinned weekly.
 * Renders an oversized title + editor blurb on the left, a 2-up grid
 * of 4 lead listings on the right. Hides if no published hero exists.
 */
export function HeroCollection() {
  const { user } = useAuth();
  const { collections } = useMarketplaceCollections('hero');
  const hero = collections[0] ?? null;
  const { listings } = useMarketplaceCollectionListings(hero?.id ?? null, 4);
  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);

  if (!hero || listings.length === 0) return null;

  return (
    <section
      aria-labelledby={`hero-collection-${hero.slug}`}
      className="mb-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12"
    >
      <header className="lg:col-span-5">
        <p className="text-13 uppercase tracking-wide text-muted-foreground mb-2">
          This week's collection
        </p>
        <h2
          id={`hero-collection-${hero.slug}`}
          className="text-headline-lg lg:text-display font-semibold mb-4 leading-tight"
        >
          {hero.title}
        </h2>
        {hero.editor_blurb && (
          <p className="text-body-lg text-muted-foreground mb-6 max-w-prose">
            {hero.editor_blurb}
          </p>
        )}
        <LocalizedLink
          to={`/marketplace/collection/${hero.slug}`}
          className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4 hover:no-underline"
        >
          See the whole collection →
        </LocalizedLink>
      </header>
      <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {listings.map((l, i) => (
          <MarketplaceCard
            key={l.id}
            listing={l}
            imageAsset={assets.get(l.id)}
            showFavoriteButton={!!user}
            priority={i < 2}
          />
        ))}
      </div>
    </section>
  );
}
