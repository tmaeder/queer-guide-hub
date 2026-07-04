import { useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MarketplaceCard } from './MarketplaceCard';
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

/** Stable week index so the featured brand rotates weekly, not per render. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Editorial feature block for ONE queer/trans-owned brand — monogram/logo,
 * story excerpt and its three strongest products. Rotates weekly across
 * the spotlight pool; hides when the pool is empty.
 */
export function BrandSpotlight() {
  const { user } = useAuth();
  const { data: pool = [] } = useSpotlightBrands(4);
  const brand = pool.length > 0 ? pool[isoWeek(new Date()) % pool.length] : null;
  const { data: detail } = useMarketplaceBrand(brand?.slug);
  const { data: listings = [] } = useBrandTopListings(detail?.brand_key, 3);
  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);
  const { register } = useCuratedIds();

  useEffect(() => {
    register('brand-spotlight', listingIds);
  }, [listingIds, register]);

  if (!brand || listings.length === 0) return null;

  const ownership = (brand.ownership_tags ?? []).filter((t) => OWNERSHIP_LABELS[t]);
  const story = detail?.story ?? null;

  return (
    <section aria-labelledby="brand-spotlight" className="mb-16 lg:mb-24">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col justify-between gap-8 rounded-container bg-muted p-8 lg:col-span-4">
          <div>
            <p className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
              Brand spotlight
            </p>
            {brand.logo_url ? (
              <img
                src={brand.logo_url}
                alt=""
                className="mb-4 h-12 w-12 rounded-element border border-border bg-background object-contain p-1.5"
              />
            ) : (
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-element border border-border bg-background font-display text-title">
                {brand.display_name.charAt(0).toUpperCase()}
              </span>
            )}
            <h2 id="brand-spotlight" className="mb-2 font-display text-headline tracking-tight">
              {brand.display_name}
            </h2>
            {ownership.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {ownership.map((t) => (
                  <Badge key={t} variant="outline">
                    {OWNERSHIP_LABELS[t]}
                  </Badge>
                ))}
              </div>
            )}
            {story ? (
              <p className="text-sm leading-relaxed text-muted-foreground line-clamp-4">{story}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {brand.product_count.toLocaleString()} listing
                {brand.product_count !== 1 ? 's' : ''} on Queer Guide.
              </p>
            )}
          </div>
          <LocalizedLink
            to={`/marketplace/brands/${brand.slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4 hover:no-underline"
          >
            Visit brand page →
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
