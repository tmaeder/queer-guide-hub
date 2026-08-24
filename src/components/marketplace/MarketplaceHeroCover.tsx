import { useEffect, useMemo } from 'react';
import {
  useMarketplaceCollections,
  useMarketplaceCollectionListings,
} from '@/hooks/useMarketplaceCollections';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { PicksPlate } from '@/components/marketplace/PicksPlate';
import { useCuratedIds } from '@/components/marketplace/useCuratedIds';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { useAuth } from '@/hooks/useAuth';

/*
 * `HERO_COVER_MIN_WIDTH` (800) and the `naturalWidth` probe that used it were
 * REMOVED here, and the reason is that the thing they guarded is gone.
 *
 * #3033 measured a real defect — the plate renders at 768-900 CSS px, and a
 * misterb listing whose only surviving copy is 143x190 was being magnified 5.4x
 * across the most prominent element on the page — and fixed it by refusing to
 * use a stand-in narrower than 800px. That made the FALLBACK safe. This change
 * deletes the fallback itself: a cover has to describe a SET, and the first
 * pick's product shot describes one member of it. With no product photo in this
 * slot there is nothing left to measure, so the probe would be an image request
 * and a state update whose result can no longer be read.
 *
 * The 800 itself is not lost — `_shared/image-gate.ts` still carries it as
 * `COVER_MIN_W` for the same judgement on the ingest side, which is where
 * #3033's finding keeps paying off.
 */

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

  // An editor's cover wins; otherwise the collection is DRAWN. What is gone is
  // the old `?? listings[0]?.images?.[0]` third arm, which published the first
  // pick's product photograph as the cover for the whole set — and since no
  // collection has ever had a `cover_image_url`, that arm was not a fallback,
  // it WAS the behaviour: on prod it made a leather vest the face of "Pride
  // essentials". See `PicksPlate`.
  const cover = hero.cover_image_url ?? null;

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
            <p className="mb-6 max-w-prose text-body-lg text-muted-foreground">
              {hero.editor_blurb}
            </p>
          )}
          <LocalizedLink
            to={`/marketplace/collection/${hero.slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4 hover:no-underline"
          >
            See the collection →
          </LocalizedLink>
        </header>
        <div className="order-1 lg:order-2 lg:col-span-7">
          {/* Cover plate in a muted tray — nested borders, no scrim, no shadow.
              Always renders now: the drawn plate needs no data, so the hero can
              no longer collapse to a title with a blank column beside it. */}
          <div className="rounded-container bg-muted p-2">
            <LocalizedLink
              to={`/marketplace/collection/${hero.slug}`}
              aria-label={hero.title}
              tabIndex={-1}
              className="block"
            >
              {/* `item_count`, not `listings.length` — the listings query is
                  capped at 3 for the lead cards below, so the plate would
                  otherwise draw every collection as a three-stop line. */}
              {cover ? (
                <Image src={cover} alt={hero.title} aspect="card" rounded="element" priority />
              ) : (
                <PicksPlate stops={hero.item_count} className="rounded-element" />
              )}
            </LocalizedLink>
          </div>
        </div>
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
