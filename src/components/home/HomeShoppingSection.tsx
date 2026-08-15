import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Band } from './Band';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { useBrandSafeRow, useMarketplaceSpotlight } from '@/hooks/useMarketplaceRows';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { timeBucket, rotateWindow } from '@/lib/rotation';

/** A day, not six hours. Merchandise has no news cycle, and the brand-safe
 *  pool is small enough that a faster turn would visibly cycle the whole thing
 *  — which reads as instability rather than freshness. */
const SHOP_ROTATION_HOURS = 24;
const SHOWN = 8;
/** Over-fetch so the window has somewhere to move, at no extra request. */
const POOL = 24;

/**
 * Homepage shopping band: one spotlight lead + a queer-owned rail.
 * All listings are SFW by construction (both hooks filter) and exit via
 * /go with their own surfaces (home_spotlight / home_rail) so shopping
 * CTR from the homepage is separable in /admin/affiliate. Self-hides
 * when the marketplace has nothing to show.
 *
 * Rotated on a daily bucket over a cached superset, never by varying the
 * request — a seed in the query would fragment the cache key and buy nothing.
 *
 * Deliberately NOT personalized: this band renders to first-time visitors
 * before any consent surface, so it stays a function of the clock alone.
 */
export default function HomeShoppingSection() {
  const { t } = useTranslation();
  // Once on mount — a bucket read per render could swap the rail mid-scroll.
  const [bucket] = useState(() => timeBucket(Date.now(), SHOP_ROTATION_HOURS));
  const { listing: spotlight, loading: spotlightLoading } = useMarketplaceSpotlight(bucket);
  const { data: rowItems, loading: rowLoading, ownedOnly } = useBrandSafeRow(POOL);

  const items = useMemo(
    () => rotateWindow(rowItems.filter((l) => l.id !== spotlight?.id), SHOWN, bucket),
    [rowItems, spotlight?.id, bucket],
  );
  const assetIds = useMemo(
    () => [...(spotlight ? [spotlight.id] : []), ...items.map((l) => l.id)],
    [spotlight, items],
  );
  const { assets } = useEntityImageAssets('marketplace_listing', assetIds);

  const loading = spotlightLoading || rowLoading;
  if (!loading && !spotlight && items.length === 0) return null;

  return (
    <Band
      surface="tint"
      eyebrow={t('home.shop.eyebrow', 'Marketplace')}
      title={
        ownedOnly
          ? t('home.shop.title', 'Queer-owned finds')
          : t('home.shop.fallbackTitle', 'Community picks')
      }
      description={
        ownedOnly
          ? t('home.shop.description', 'Products and services from queer- and trans-owned businesses.')
          : undefined
      }
      seeAllHref="/marketplace"
      seeAllLabel={t('home.shop.seeAll', 'Marketplace')}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {spotlight && (
          <div className="lg:col-span-4">
            <MarketplaceCard
              listing={spotlight}
              imageAsset={assets.get(spotlight.id)}
              surface="home_spotlight"
              priority
            />
          </div>
        )}
        <div className={spotlight ? 'min-w-0 lg:col-span-8' : 'min-w-0 lg:col-span-12'}>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
            {(loading && items.length === 0
              ? Array.from({ length: 4 }).map(() => null)
              : items
            ).map((listing, i) =>
              listing ? (
                <div key={listing.id} className="snap-start shrink-0 w-[240px] sm:w-[280px]">
                  <MarketplaceCard
                    listing={listing}
                    imageAsset={assets.get(listing.id)}
                    surface="home_rail"
                  />
                </div>
              ) : (
                <div key={i} className="snap-start shrink-0 w-[240px] sm:w-[280px]">
                  <MarketplaceCard loading />
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </Band>
  );
}
