import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HomeSection } from './HomeSection';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { useMarketplaceRow, useMarketplaceSpotlight } from '@/hooks/useMarketplaceRows';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';

/**
 * Homepage shopping band: one spotlight lead + a queer-owned rail.
 * All listings are SFW by construction (both hooks filter) and exit via
 * /go with their own surfaces (home_spotlight / home_rail) so shopping
 * CTR from the homepage is separable in /admin/affiliate. Self-hides
 * when the marketplace has nothing to show.
 */
export default function HomeShoppingSection() {
  const { t } = useTranslation();
  const { listing: spotlight, loading: spotlightLoading } = useMarketplaceSpotlight();
  const { data: rowItems, loading: rowLoading } = useMarketplaceRow('queer-owned', 9);

  const items = useMemo(
    () => rowItems.filter((l) => l.id !== spotlight?.id).slice(0, 8),
    [rowItems, spotlight?.id],
  );
  const assetIds = useMemo(
    () => [...(spotlight ? [spotlight.id] : []), ...items.map((l) => l.id)],
    [spotlight, items],
  );
  const { assets } = useEntityImageAssets('marketplace_listing', assetIds);

  const loading = spotlightLoading || rowLoading;
  if (!loading && !spotlight && items.length === 0) return null;

  return (
    <HomeSection
      eyebrow={t('home.shop.eyebrow', 'Marketplace')}
      title={t('home.shop.title', 'Queer-owned finds')}
      description={t('home.shop.description', 'Products and services from queer- and trans-owned businesses.')}
      seeAllHref="/marketplace"
      seeAllLabel={t('home.shop.seeAll', 'Marketplace')}
      tinted
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
    </HomeSection>
  );
}
