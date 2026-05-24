import { memo } from 'react';
import { MotionCard as Card, CardImage } from '@/components/ui/card';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { Store, ExternalLink } from 'lucide-react';
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
}: MarketplaceCardProps) {
  const { currency } = useCurrency();
  const { data: rates } = useFxRates();

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
  const outbound = getOutboundLink(listing);
  const isAffiliate = outbound?.isAffiliate ?? false;
  const isAdult = isAdultListing(listing);
  const outOfStock = listing.in_stock === false;

  return (
    <CardHoverEffect>
      <Card className="group transition-colors duration-300 hover:border-foreground/40">
        <div className="relative">
          <CardImage
            src={listingImage}
            alt={listing.title}
            fallbackIcon={Store}
            height={192}
            priority={priority}
          />
          {showFavoriteButton && (
            <div className="absolute top-2 right-2 z-10">
              <WishlistPicker listingId={listing.id} />
            </div>
          )}
        </div>

        <div className="p-6 flex flex-col gap-2">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
            <span>{listing.category}</span>
            {listing.business_name && (
              <>
                <span className="mx-1.5">·</span>
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
              </>
            )}
            {isAffiliate && <span className="ml-1.5">· Sponsored</span>}
          </p>

          <h2 className="text-base font-semibold leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
            {isAdult && <span className="mr-1.5 text-2xs uppercase tracking-wider text-muted-foreground">18+</span>}
            <LocalizedLink
              to={`/marketplace/${listing.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline underline-offset-2"
            >
              <HighlightedText text={listing.title} query={searchQuery} />
            </LocalizedLink>
          </h2>

          {listing.description && (
            <p
              className="text-sm text-muted-foreground overflow-hidden leading-normal"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
            >
              <HighlightedText text={listing.description} query={searchQuery} />
            </p>
          )}

          <div className="flex items-end justify-between gap-2 pt-4 border-t border-border">
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-1.5">
                {price.modifier && (
                  <span className="text-2xs uppercase tracking-wider text-muted-foreground">{price.modifier}</span>
                )}
                <p
                  className={`text-base font-bold leading-none ${outOfStock ? 'line-through text-muted-foreground' : ''}`}
                >
                  {price.primary}
                </p>
              </div>
              {price.secondary && (
                <p className="text-xs text-muted-foreground mt-0.5">{price.secondary}</p>
              )}
              {outOfStock && (
                <p className="text-2xs uppercase tracking-wider text-muted-foreground mt-1">Out of stock</p>
              )}
            </div>

            {outbound ? (
              <a
                href={outbound.url}
                target="_blank"
                rel={outbound.rel}
                onClick={(e) => e.stopPropagation()}
                data-affiliate={outbound.isAffiliate ? 'true' : undefined}
                className="inline-flex items-center gap-1.5 rounded-element px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
                style={{
                  backgroundColor: 'hsl(var(--foreground))',
                  color: 'hsl(var(--background))',
                }}
                aria-label={`${outbound.label} (opens in new tab)`}
              >
                {outbound.label}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            ) : (
              <LocalizedLink
                to={`/marketplace/${listing.slug}`}
                className="inline-flex items-center gap-1.5 rounded-element px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
                style={{
                  backgroundColor: 'hsl(var(--foreground))',
                  color: 'hsl(var(--background))',
                }}
              >
                View
              </LocalizedLink>
            )}
          </div>
        </div>
      </Card>
    </CardHoverEffect>
  );
}

export const MarketplaceCard = memo(MarketplaceCardImpl);
