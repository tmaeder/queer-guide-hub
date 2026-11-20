import { useEffect, useMemo } from 'react';
import { ArrowRight } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Image } from '@/components/ui/Image';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MarketplaceCard } from './MarketplaceCard';
import { BrandMark } from './BrandMark';
import { useCuratedIds } from './useCuratedIds';
import {
  useBrandTopListings,
  useMarketplaceBrand,
  useSpotlightBrands,
} from '@/hooks/useMarketplaceBrands';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useAuth } from '@/hooks/useAuth';

const OWNERSHIP_LABELS: Record<string, string> = {
  queer_owned: 'Queer-owned',
  trans_owned: 'Trans-owned',
  bipoc_owned: 'BIPOC-owned',
  women_owned: 'Women-owned',
  disabled_owned: 'Disabled-owned',
  nonprofit: 'Non-profit',
};

/** Days since the epoch: the featured brand changes daily, not per render. */
const dayIndex = (date: Date) => Math.floor(date.getTime() / 86_400_000);

/**
 * Editorial feature block for ONE queer/trans-owned brand — monogram/logo,
 * story excerpt and its three strongest products. Rotates daily across
 * the spotlight pool; hides when the pool is empty.
 */
export function BrandSpotlight() {
  const { user } = useAuth();
  const { data: pool = [] } = useSpotlightBrands(30);
  const brand = pool.length > 0 ? pool[dayIndex(new Date()) % pool.length] : null;
  const { data: detail } = useMarketplaceBrand(brand?.slug);
  // Top 3 as cards beside the panel, the next 4 as a photo strip inside it.
  const { data: top = [] } = useBrandTopListings(detail?.brand_key, 7);
  const listings = useMemo(() => top.slice(0, 3), [top]);
  const listingIds = useMemo(() => top.map((l) => l.id), [top]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds, top);
  const { register } = useCuratedIds();

  useEffect(() => {
    register('brand-spotlight', listingIds);
  }, [listingIds, register]);

  if (!brand || listings.length === 0) return null;

  const ownership = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABELS[t]);
  // Overview surfaces may only show a listing's approved asset, never a raw
  // merchant image, so a product without one is left out of the strip.
  const strip = top.slice(3).flatMap((l) => {
    const asset = assets.get(l.id);
    return l.overview_image_asset_id && asset?.id === l.overview_image_asset_id
      ? [{ listing: l, asset }]
      : [];
  });
  const story = detail?.story ?? null;

  return (
    <section aria-labelledby="brand-spotlight" className="mb-16 lg:mb-24">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col justify-between gap-8 rounded-panel bg-card p-8 shadow-soft lg:col-span-4">
          <div className="flex flex-col gap-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              Brand spotlight
            </p>
            <div className="flex items-center gap-4">
              <BrandMark
                name={brand.display_name}
                logoUrl={brand.logo_url}
                onInk={brand.logo_on_ink ?? false}
                className="h-16 w-16 shrink-0 rounded-container"
                monogramClassName="text-headline font-bold"
                padding="p-1.5"
              />
              <div className="min-w-0">
                <h2
                  id="brand-spotlight"
                  className="font-display text-headline leading-tight tracking-tight"
                >
                  {brand.display_name}
                </h2>
                <p className="text-13 text-muted-foreground">
                  {brand.product_count.toLocaleString()} listing
                  {brand.product_count !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {ownership.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ownership.map((t) => (
                  <Badge key={t} variant="soft">
                    {OWNERSHIP_LABELS[t]}
                  </Badge>
                ))}
              </div>
            )}
            {story && (
              <p className="text-15 leading-relaxed text-muted-foreground line-clamp-4">{story}</p>
            )}
            {strip.length > 0 && (
              <ul aria-label={`More from ${brand.display_name}`} className="grid grid-cols-4 gap-2">
                {strip.map(({ listing: l, asset }) => (
                  <li key={l.id}>
                    <LocalizedLink
                      to={`/marketplace/${l.slug}`}
                      aria-label={l.title}
                      className="block overflow-hidden rounded-element"
                    >
                      <Image
                        imageUrl={asset.url ?? null}
                        optimizedUrl={asset.optimized_url ?? null}
                        thumbnailUrl={asset.thumbnail_url ?? null}
                        alt=""
                        aspect="square"
                        rounded="none"
                        fallbackEntityType="marketplace"
                        fallbackKey={l.id}
                      />
                    </LocalizedLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <LocalizedLink
            to={`/marketplace/brands/${brand.slug}`}
            aria-label={`Visit ${brand.display_name}`}
            className="no-underline inline-flex size-11 items-center justify-center self-start rounded-element bg-foreground text-background hover:opacity-90"
          >
            <ArrowRight size={18} aria-hidden className="rtl:rotate-180" />
          </LocalizedLink>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:col-span-8">
          {listings.map((l) => (
            <MarketplaceCard
              key={l.id}
              listing={l}
              imageAsset={assets.get(l.id)}
              showFavoriteButton={!!user}
              surface="marketplace_grid"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
