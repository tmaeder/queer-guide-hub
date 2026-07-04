import { memo, useState } from 'react';
import { MotionCard as Card } from '@/components/ui/card';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { Image } from '@/components/ui/Image';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { WishlistPicker } from '@/components/marketplace/WishlistPicker';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import type { EntityImageAsset } from '@/hooks/useEntityImageAssets';
import { useCurrency } from '@/hooks/useCurrency';
import { useFxRates } from '@/hooks/useFxRates';
import { isAdultListing } from '@/hooks/useAdultContent';
import { brandSlug, departmentLabel, departmentOf } from '@/lib/marketplaceTaxonomy';
import type { MarketplaceSurface } from '@/lib/affiliate/marketplace';
import { formatListingPrice, getOutboundLink, highlightMatches } from './marketplaceHelpers';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

interface MarketplaceCardProps {
  listing?: MarketplaceListing & {
    marketplace_reviews?: Array<{ rating: number }>;
    marketplace_favorites?: Array<{ id: string }>;
    venues?: { name: string; address: string; city: string } | null;
  };
  onViewDetails?: (listing: MarketplaceListing) => void;
  onToggleFavorite?: (listingId: string) => void;
  showFavoriteButton?: boolean;
  loading?: boolean;
  searchQuery?: string;
  imageAsset?: EntityImageAsset;
  /** Eager-load the image (above-the-fold cards). */
  priority?: boolean;
  /** Attribution surface for the outbound /go link. */
  surface?: MarketplaceSurface;
  /** `row` renders a horizontal layout for list mode. */
  variant?: 'grid' | 'row';
}

function HighlightedText({ text, query }: { text: string; query?: string }) {
  const parts = highlightMatches(text, query);
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="bg-transparent text-foreground underline underline-offset-2 decoration-foreground/60">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function MarketplaceCardImpl({
  listing,
  loading = false,
  showFavoriteButton = false,
  searchQuery,
  imageAsset,
  priority = false,
  surface = 'marketplace_grid',
  variant = 'grid',
}: MarketplaceCardProps) {
  const { currency } = useCurrency();
  const { data: rates } = useFxRates();
  // Second image mounts only after first hover — 24 cards per page must
  // not double their image fetches for a hover flourish nobody triggers.
  const [hovered, setHovered] = useState(false);

  if (loading || !listing) {
    return (
      <Skeleton name="marketplace-card" loading={true} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  const price = formatListingPrice(listing, { displayCurrency: currency, rates });
  const listingImage = resolveImageUrl({
    imageUrl: listing.images?.[0] ?? null,
    optimizedUrl: imageAsset?.optimized_url ?? null,
    thumbnailUrl: imageAsset?.thumbnail_url ?? null,
  });
  const secondImage = listing.images?.[1] ?? null;
  const outbound = getOutboundLink(listing, surface);
  const isAffiliate = outbound?.isAffiliate ?? false;
  const isAdult = isAdultListing(listing);
  const outOfStock = listing.in_stock === false;

  const queerOwned = (listing.community_owned_tags ?? []).some(
    (t) => t === 'queer_owned' || t === 'trans_owned',
  );

  const metaFacts = [
    listing.last_verified_at ? 'Verified' : null,
    listing.venues?.city ? listing.venues.city : null,
  ].filter(Boolean);

  const imageBlock = (
    <div className="relative">
      {/* Nested tray: image plate sits in a muted frame — depth from
          borders and surfaces, never shadows. */}
      <div className="bg-muted p-1.5 rounded-t-container">
        <LocalizedLink
          to={`/marketplace/${listing.slug}`}
          className="block"
          aria-label={listing.title}
          tabIndex={-1}
        >
          <div className="relative">
            <Image
              src={listingImage ?? undefined}
              alt={listing.title}
              aspect="portrait"
              rounded="element"
              priority={priority}
            />
            {secondImage && hovered && (
              <img
                src={secondImage}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full rounded-element object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            )}
          </div>
        </LocalizedLink>
      </div>
      {showFavoriteButton && (
        <div className="absolute top-2 right-2 z-10">
          <WishlistPicker listingId={listing.id} />
        </div>
      )}
    </div>
  );

  // Boutique card: image-led, quiet meta, no per-card CTA — the whole card
  // goes to the detail page, where the outbound/affiliate CTA lives.
  if (variant === 'row') {
    return (
      <CardHoverEffect>
        <Card
          className="group flex flex-row items-stretch gap-4 p-2 transition-colors duration-300 hover:border-foreground/40"
          onMouseEnter={() => setHovered(true)}
        >
          <div className="relative w-28 shrink-0 overflow-hidden rounded-element sm:w-32">
            <LocalizedLink
              to={`/marketplace/${listing.slug}`}
              className="block"
              aria-label={listing.title}
              tabIndex={-1}
            >
              <Image
                src={listingImage ?? undefined}
                alt={listing.title}
                aspect="square"
                rounded="element"
              />
            </LocalizedLink>
            {showFavoriteButton && (
              <div className="absolute top-1.5 right-1.5 z-10">
                <WishlistPicker listingId={listing.id} />
              </div>
            )}
          </div>
          <RowBody
            listing={listing}
            price={price}
            searchQuery={searchQuery}
            isAdult={isAdult}
            isAffiliate={isAffiliate}
            outOfStock={outOfStock}
            queerOwned={queerOwned}
          />
        </Card>
      </CardHoverEffect>
    );
  }

  return (
    <CardHoverEffect>
      <Card
        className="group transition-colors duration-300 hover:border-foreground/40"
        onMouseEnter={() => setHovered(true)}
      >
        {imageBlock}

        <div className="p-4 flex flex-col gap-1.5">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
            {/* Brand leads (linked to its brand page); department gives context. */}
            {listing.brand && brandSlug(listing.brand) ? (
              <>
                <LocalizedLink
                  to={`/marketplace/brands/${brandSlug(listing.brand)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-foreground"
                >
                  <HighlightedText text={listing.brand} query={searchQuery} />
                </LocalizedLink>
                <span className="mx-1.5">·</span>
              </>
            ) : listing.business_name ? (
              <>
                {listing.merchant_domain ? (
                  <LocalizedLink
                    to={`/marketplace/merchants/${listing.merchant_domain}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-foreground"
                  >
                    <HighlightedText text={listing.business_name} query={searchQuery} />
                  </LocalizedLink>
                ) : (
                  <HighlightedText text={listing.business_name} query={searchQuery} />
                )}
                <span className="mx-1.5">·</span>
              </>
            ) : null}
            <span>{departmentLabel(listing.department ?? departmentOf(listing.subcategory_slug))}</span>
          </p>

          <h2 className="text-15 font-medium leading-snug line-clamp-2 text-balance">
            {isAdult && <span className="mr-1.5 text-2xs uppercase tracking-wider text-muted-foreground">18+</span>}
            <LocalizedLink
              to={`/marketplace/${listing.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="py-1 hover:underline underline-offset-2"
            >
              <HighlightedText text={listing.title} query={searchQuery} />
            </LocalizedLink>
          </h2>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              {price.modifier && (
                <span className="text-2xs uppercase tracking-wider text-muted-foreground">{price.modifier}</span>
              )}
              <p
                className={`text-15 font-semibold leading-none tabular-nums ${outOfStock ? 'line-through text-muted-foreground' : ''}`}
              >
                {price.primary}
              </p>
              {price.secondary && (
                <span className="text-xs text-muted-foreground">{price.secondary}</span>
              )}
              {/* FTC-honest without shouting: monetized listings get an Ad marker. */}
              {isAffiliate && (
                <span className="text-2xs uppercase tracking-wider text-muted-foreground">Ad</span>
              )}
            </div>
            {queerOwned && <Badge variant="outline">Queer-owned</Badge>}
          </div>
          {outOfStock && (
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">Out of stock</p>
          )}
          {/* Quiet trust line, revealed on hover where hover exists. */}
          {metaFacts.length > 0 && (
            <p className="hidden text-2xs uppercase tracking-wider text-muted-foreground sm:block sm:opacity-0 sm:transition-opacity sm:duration-300 sm:group-hover:opacity-100">
              {metaFacts.join(' · ')}
            </p>
          )}
        </div>
      </Card>
    </CardHoverEffect>
  );
}

function RowBody({
  listing,
  price,
  searchQuery,
  isAdult,
  isAffiliate,
  outOfStock,
  queerOwned,
}: {
  listing: NonNullable<MarketplaceCardProps['listing']>;
  price: ReturnType<typeof formatListingPrice>;
  searchQuery?: string;
  isAdult: boolean;
  isAffiliate: boolean;
  outOfStock: boolean;
  queerOwned: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-2 pr-2">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
        {listing.brand && brandSlug(listing.brand) ? (
          <>
            <LocalizedLink
              to={`/marketplace/brands/${brandSlug(listing.brand)}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-foreground"
            >
              <HighlightedText text={listing.brand} query={searchQuery} />
            </LocalizedLink>
            <span className="mx-1.5">·</span>
          </>
        ) : listing.business_name ? (
          <>
            <HighlightedText text={listing.business_name} query={searchQuery} />
            <span className="mx-1.5">·</span>
          </>
        ) : null}
        <span>{departmentLabel(listing.department ?? departmentOf(listing.subcategory_slug))}</span>
      </p>
      <h2 className="text-15 font-medium leading-snug line-clamp-2">
        {isAdult && (
          <span className="mr-1.5 text-2xs uppercase tracking-wider text-muted-foreground">18+</span>
        )}
        <LocalizedLink
          to={`/marketplace/${listing.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline underline-offset-2"
        >
          <HighlightedText text={listing.title} query={searchQuery} />
        </LocalizedLink>
      </h2>
      <div className="flex items-center gap-2">
        <p
          className={`text-15 font-semibold leading-none tabular-nums ${outOfStock ? 'line-through text-muted-foreground' : ''}`}
        >
          {price.primary}
        </p>
        {price.secondary && <span className="text-xs text-muted-foreground">{price.secondary}</span>}
        {isAffiliate && (
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">Ad</span>
        )}
        {outOfStock && (
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">Out of stock</span>
        )}
        {queerOwned && <Badge variant="outline">Queer-owned</Badge>}
      </div>
    </div>
  );
}

export const MarketplaceCard = memo(MarketplaceCardImpl);
