import { useEffect, useMemo } from 'react';
import {
  useMarketplaceCollections,
  useMarketplaceCollectionListings,
} from '@/hooks/useMarketplaceCollections';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { useCuratedIds } from '@/components/marketplace/useCuratedIds';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { useAuth } from '@/hooks/useAuth';

/**
 * Cover story — the pinned hero collection opens the page like a magazine
 * spread: art-directed cover image right, display-face title left, three
 * lead listings underneath. Hides when no published hero exists.
 */
export function MarketplaceHeroCover() {
  const { user } = useAuth();
  const { collections } = useMarketplaceCollections('hero');
  const hero = collections[0] ?? null;
  const { listings } = useMarketplaceCollectionListings(hero?.id ?? null, 3);
  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);
  const { register } = useCuratedIds();

  useEffect(() => {
    register('hero', listingIds);
  }, [listingIds, register]);

  if (!hero || listings.length === 0) return null;

  const cover = hero.cover_image_url ?? listings[0]?.images?.[0] ?? null;

  return (
    <section aria-labelledby={`hero-collection-${hero.slug}`} className="mb-16 lg:mb-24">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
        <header className="order-2 lg:order-1 lg:col-span-5">
          <p className="mb-2 text-2xs uppercase tracking-wider text-muted-foreground">This week</p>
          <h2
            id={`hero-collection-${hero.slug}`}
            className="mb-4 font-display text-display leading-tight lg:text-hero"
          >
            {hero.title}
          </h2>
          {hero.editor_blurb && (
            <p className="mb-6 max-w-prose text-body-lg text-muted-foreground">{hero.editor_blurb}</p>
          )}
          <LocalizedLink
            to={`/marketplace/collection/${hero.slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4 hover:no-underline"
          >
            See the collection →
          </LocalizedLink>
        </header>
        {cover && (
          <div className="order-1 lg:order-2 lg:col-span-7">
            {/* Cover plate in a muted tray — nested borders, no scrim, no shadow. */}
            <div className="rounded-container border border-border bg-muted p-2">
              <LocalizedLink
                to={`/marketplace/collection/${hero.slug}`}
                aria-label={hero.title}
                tabIndex={-1}
                className="block"
              >
                <Image src={cover} alt={hero.title} aspect="card" rounded="element" priority />
              </LocalizedLink>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 lg:gap-8">
        {listings.map((l, i) => (
          <MarketplaceCard
            key={l.id}
            listing={l}
            imageAsset={assets.get(l.id)}
            showFavoriteButton={!!user}
            priority={i < 3}
          />
        ))}
      </div>
    </section>
  );
}
