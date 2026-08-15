import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
// `Card`, NOT `MotionCard`. MotionCard is a borderless tinted plate that
// hover-tints (`hover:bg-muted/40`), and this card is ALSO wrapped in
// CardHoverEffect, which casts `.card-lift`. So every marketplace card filled
// AND lifted — the one hard rule of the design system ("a card fills ink on
// hover or lifts with the hard shadow, never both") broken on the app's
// largest grid, inherited by ~12 call sites. Card gives the 3px ink border and
// no hover fill; the lift is the only hover language here.
import { Card } from '@/components/ui/card';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { Image } from '@/components/ui/Image';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { WishlistPicker } from '@/components/marketplace/WishlistPicker';
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
  // NOTE: there are deliberately no `onViewDetails` / `onToggleFavorite` props.
  // They were declared here and never destructured by the implementation, so
  // the page's handlers — 23 lines of auth check, toast and refetch, plus an
  // `incrementViews` call — could never fire from the grid. Favoriting really
  // happens inside <WishlistPicker/>, and the whole card is a link to the
  // detail page. Do not re-add them without a call site that reads them.
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
          <mark
            key={i}
            className="bg-transparent text-foreground underline underline-offset-2 decoration-foreground/60"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The card's disclosure row, above the title in both variants.
 *
 * Three things moved here out of the price line and the heading:
 *  - `18+` was rendered INSIDE the <h3>, so it was read into the accessible
 *    name of every adult listing ("18+ Some Product"). It is a status, not
 *    part of the title. Ink fill, never `--destructive` — that hue is reserved
 *    for harm to the reader, and an adult listing is not a danger.
 *  - `Ad` sat beside the price, after the thing it discloses. The FTC wants
 *    the disclosure before the monetised link, and this is the highest a
 *    per-card marker can go.
 *  - `Queer-owned` is an attribute, so it stays a paper `soft` chip and never
 *    takes a track colour: track colours are wayfinding and never a state.
 *
 * No overflow mechanism, deliberately: every chip here is monochrome, at most
 * three can co-occur, and `queerOwned` is true for well under 1% of rows.
 */
function CardBadges({
  isAdult,
  isAffiliate,
  queerOwned,
}: {
  isAdult: boolean;
  isAffiliate: boolean;
  queerOwned: boolean;
}) {
  const { t } = useTranslation();
  if (!isAdult && !isAffiliate && !queerOwned) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isAdult && <Badge variant="default">{t('marketplace.adultBadge', '18+')}</Badge>}
      {isAffiliate && <Badge variant="soft">{t('marketplace.adBadge', 'Ad')}</Badge>}
      {queerOwned && (
        <Badge variant="soft">{t('marketplace.queerOwnedBadge', 'Queer-owned')}</Badge>
      )}
    </div>
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
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const { data: rates } = useFxRates();
  // Second image mounts only after first hover — 24 cards per page must
  // not double their image fetches for a hover flourish nobody triggers.
  const [hovered, setHovered] = useState(false);

  if (loading || !listing) {
    // A bordered pulse plate in the real card's shape, not a generic skeleton:
    // the grid should not change its geometry when the data lands.
    return (
      <div className="border-[3px] border-foreground/20 bg-card" aria-hidden="true">
        <div className="aspect-[3/4] animate-pulse border-b-[3px] border-foreground/20 bg-muted" />
        <div className="flex flex-col gap-2 p-4">
          <div className="h-2.5 w-1/3 animate-pulse bg-muted" />
          <div className="h-4 w-5/6 animate-pulse bg-muted" />
          <div className="h-4 w-1/4 animate-pulse bg-muted" />
        </div>
      </div>
    );
  }

  const price = formatListingPrice(listing, { displayCurrency: currency, rates });
  // Hand <Image> the raw sources instead of pre-resolving to one URL: it walks
  // optimized → thumbnail → original on error, so a mirror-host outage falls
  // back to the merchant's own image rather than to a texture.
  const listingSources = {
    imageUrl: listing.images?.[0] ?? null,
    optimizedUrl: imageAsset?.optimized_url ?? null,
    thumbnailUrl: imageAsset?.thumbnail_url ?? null,
  };
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
      {/* The card's own 3px border IS the frame — no plate inside a plate. The
          image used to sit in a nested `bg-muted p-1.5` tray, a PASTE-UP-era
          device ("depth from borders and surfaces, never shadows") that the
          subway spec reversed. A rule under the image separates it from the
          text block the same way a band separates two sections of the page. */}
      <div className="border-b-[3px] border-foreground">
        <LocalizedLink
          to={`/marketplace/${listing.slug}`}
          className="block"
          aria-label={listing.title}
          tabIndex={-1}
        >
          <div className="relative">
            <Image
              {...listingSources}
              alt={listing.title}
              aspect="portrait"
              rounded="none"
              priority={priority}
              fallbackEntityType="marketplace"
              fallbackKey={listing.id}
            />
            {secondImage && hovered && (
              <img
                src={secondImage}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-normal group-hover:opacity-100"
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
          className="group flex flex-row items-stretch gap-4 p-2"
          onMouseEnter={() => setHovered(true)}
        >
          <div className="relative w-28 shrink-0 overflow-hidden border-2 border-foreground sm:w-32">
            <LocalizedLink
              to={`/marketplace/${listing.slug}`}
              className="block"
              aria-label={listing.title}
              tabIndex={-1}
            >
              <Image
                {...listingSources}
                alt={listing.title}
                aspect="square"
                rounded="none"
                fallbackEntityType="marketplace"
                fallbackKey={listing.id}
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
      {/* No `hover:border-foreground/40` and no `hoverable`: a border tint is a
          second hover language competing with the lift. The card lifts. */}
      <Card className="group overflow-hidden" onMouseEnter={() => setHovered(true)}>
        {imageBlock}

        <div className="p-4 flex flex-col gap-2">
          <CardBadges isAdult={isAdult} isAffiliate={isAffiliate} queerOwned={queerOwned} />

          <p className="text-2xs uppercase tracking-label text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
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
            <span>
              {departmentLabel(listing.department ?? departmentOf(listing.subcategory_slug))}
            </span>
          </p>

          {/* Station-name weight. The 18+ marker is no longer inside the
              heading — it was being read into the accessible name. */}
          <h3 className="text-title font-bold leading-snug line-clamp-2 text-balance">
            <LocalizedLink
              to={`/marketplace/${listing.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="py-1 hover:underline underline-offset-2"
            >
              <HighlightedText text={listing.title} query={searchQuery} />
            </LocalizedLink>
          </h3>

          <div className="flex items-baseline gap-1.5 min-w-0">
            {price.modifier && (
              <span className="text-2xs uppercase tracking-label text-muted-foreground">
                {price.modifier}
              </span>
            )}
            <p
              className={`text-title font-bold leading-none tabular-nums ${outOfStock ? 'line-through text-muted-foreground' : ''}`}
            >
              {price.primary}
            </p>
            {price.secondary && (
              <span className="text-xs text-muted-foreground">{price.secondary}</span>
            )}
            {outOfStock && (
              <span className="text-2xs uppercase tracking-label text-muted-foreground">
                {t('marketplace.outOfStock', 'Out of stock')}
              </span>
            )}
          </div>
          {/* Persistent, not hover-revealed. This line was `sm:opacity-0
              sm:group-hover:opacity-100`, i.e. invisible on touch — which is
              most of the traffic — and invisible to anyone not using a mouse. */}
          {metaFacts.length > 0 && (
            <p className="text-2xs uppercase tracking-label text-muted-foreground">
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
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-2 pr-2">
      <CardBadges isAdult={isAdult} isAffiliate={isAffiliate} queerOwned={queerOwned} />
      <p className="text-2xs uppercase tracking-label text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
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
      <h3 className="text-title font-bold leading-snug line-clamp-2">
        <LocalizedLink
          to={`/marketplace/${listing.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline underline-offset-2"
        >
          <HighlightedText text={listing.title} query={searchQuery} />
        </LocalizedLink>
      </h3>
      <div className="flex items-baseline gap-2">
        <p
          className={`text-title font-bold leading-none tabular-nums ${outOfStock ? 'line-through text-muted-foreground' : ''}`}
        >
          {price.primary}
        </p>
        {price.secondary && (
          <span className="text-xs text-muted-foreground">{price.secondary}</span>
        )}
        {outOfStock && (
          <span className="text-2xs uppercase tracking-label text-muted-foreground">
            {t('marketplace.outOfStock', 'Out of stock')}
          </span>
        )}
      </div>
    </div>
  );
}

export const MarketplaceCard = memo(MarketplaceCardImpl);
