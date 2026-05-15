import type { CSSProperties } from 'react';
import { MotionCard as Card, CardImage } from '@/components/ui/card';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Phone, Mail, Eye, Store, AlertTriangle, ExternalLink } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import type { EntityImageAsset } from '@/hooks/useEntityImageAssets';
import {
  formatListingPrice,
  getOutboundLink,
  highlightMatches,
  linkHealthState,
  sourceProvenanceLine,
  trustPillsFor,
} from './marketplaceHelpers';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

const ICON_LINK_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  minHeight: 44,
};

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

export function MarketplaceCard({
  listing,
  loading = false,
  showFavoriteButton = false,
  searchQuery,
  imageAsset,
}: MarketplaceCardProps) {
  if (loading || !listing) {
    return (
      <Skeleton name="marketplace-card" loading={true} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  const averageRating = listing.marketplace_reviews?.length
    ? listing.marketplace_reviews.reduce((sum, review) => sum + review.rating, 0) /
      listing.marketplace_reviews.length
    : 0;

  const price = formatListingPrice(listing);
  const listingImage = resolveImageUrl({
    imageUrl: listing.images?.[0] ?? null,
    optimizedUrl: imageAsset?.optimized_url ?? null,
    thumbnailUrl: imageAsset?.thumbnail_url ?? null,
  });
  const outbound = getOutboundLink(listing);
  const pills = trustPillsFor(listing);
  const provenance = sourceProvenanceLine(listing);
  const linkState = linkHealthState(listing);

  return (
    <CardHoverEffect>
      <Card>
        <div className="relative">
          <CardImage src={listingImage} alt={listing.title} fallbackIcon={Store} height={160} />
          {listing.featured && (
            <div className="absolute top-2 left-2 z-10">
              <Badge>Featured</Badge>
            </div>
          )}
          {showFavoriteButton && (
            <div className="absolute top-2 right-2 z-10">
              <FavoriteButton itemId={listing.id} type="marketplace" variant="ghost" size="sm" />
            </div>
          )}
        </div>

        <div className="p-6 flex flex-col gap-4 relative">
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold leading-tight overflow-hidden text-ellipsis whitespace-nowrap text-base">
                  <HighlightedText text={listing.title} query={searchQuery} />
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
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
                  {provenance && (
                    <span className="ml-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/70">
                      · {provenance}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Badge variant="secondary">{listing.category}</Badge>
              </div>
            </div>

            {(listing.venues?.name || listing.location) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin style={{ height: 12, width: 12, flexShrink: 0 }} aria-hidden="true" />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  {listing.venues ? `${listing.venues.name}, ${listing.venues.city}` : listing.location}
                </span>
              </div>
            )}

            {pills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {pills.slice(0, 2).map((p) => (
                  <span
                    key={p.key}
                    title={p.title}
                    className="inline-flex items-center rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    {p.label}
                  </span>
                ))}
                {pills.length > 2 && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 self-center">
                    +{pills.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>

          {listing.description && (
            <p
              className="text-sm text-muted-foreground overflow-hidden leading-normal"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
            >
              <HighlightedText text={listing.description} query={searchQuery} />
            </p>
          )}

          <div className="flex items-end justify-between gap-2">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1.5">
                {price.modifier && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{price.modifier}</span>
                )}
                <p className="text-base font-bold leading-none">{price.primary}</p>
              </div>
              {price.secondary && (
                <p className="text-xs text-muted-foreground mt-0.5">{price.secondary}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5">
                {listing.shipping_available && <Badge variant="outline">Ships</Badge>}
                {listing.in_stock === false && <Badge variant="outline">Out of stock</Badge>}
              </div>
            </div>

            {averageRating > 0 && (
              <div className="flex items-center gap-1">
                <Star style={{ height: 14, width: 14 }} fill="currentColor" aria-hidden="true" />
                <p className="text-sm font-medium">{averageRating.toFixed(1)}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-1">
              {listing.contact_phone && (
                <Button size="default" variant="ghost" aria-label={`Call ${listing.contact_phone}`} asChild>
                  <a href={`tel:${listing.contact_phone}`} onClick={(e) => e.stopPropagation()} style={ICON_LINK_STYLE}>
                    <Phone style={{ height: 16, width: 16 }} aria-hidden="true" />
                  </a>
                </Button>
              )}
              {listing.contact_email && (
                <Button size="default" variant="ghost" aria-label={`Email ${listing.contact_email}`} asChild>
                  <a href={`mailto:${listing.contact_email}`} onClick={(e) => e.stopPropagation()} style={ICON_LINK_STYLE}>
                    <Mail style={{ height: 16, width: 16 }} aria-hidden="true" />
                  </a>
                </Button>
              )}

              {listing.views_count && listing.views_count > 0 ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                  <Eye style={{ height: 12, width: 12 }} aria-hidden="true" />
                  <span>{listing.views_count}</span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {outbound ? (
                <>
                  <LocalizedLink
                    to={`/marketplace/${listing.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Details
                  </LocalizedLink>
                  <a
                    href={outbound.url}
                    target="_blank"
                    rel={outbound.rel}
                    onClick={(e) => e.stopPropagation()}
                    data-affiliate={outbound.isAffiliate ? 'true' : undefined}
                    className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                    aria-label={`${outbound.label} (opens in new tab)`}
                  >
                    {outbound.label}
                    <ExternalLink style={{ width: 14, height: 14 }} aria-hidden="true" />
                  </a>
                </>
              ) : (
                <LocalizedLink to={`/marketplace/${listing.slug}`}>
                  <Button size="sm">View</Button>
                </LocalizedLink>
              )}
              {linkState === 'stale' && (
                <span title="Link not recently verified" className="text-muted-foreground" aria-label="Link not recently verified">
                  <AlertTriangle style={{ width: 14, height: 14 }} aria-hidden="true" />
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </CardHoverEffect>
  );
}
