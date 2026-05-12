import type { CSSProperties } from 'react';
import { formatCurrency } from '@/lib/currency';
import { MotionCard as Card, CardImage } from '@/components/ui/card';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Phone, Mail, ExternalLink, Eye, Store } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

// 44×44 icon-link target so axe target-size (and WCAG 2.5.8) pass.
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
}

export function MarketplaceCard({
  listing,
  loading = false,
  showFavoriteButton = false,
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
  const formatPrice = () => {
    if (!listing.price) {
      if (listing.price_type === 'free') return 'Free';
      return 'Price varies';
    }

    const price = formatCurrency(listing.price, listing.currency || 'USD');

    switch (listing.price_type) {
      case 'starting_at':
        return `Starting at ${price}`;
      case 'negotiable':
        return `${price} (negotiable)`;
      case 'free':
        return 'Free';
      default:
        return price;
    }
  };
  const listingImage = listing.images?.[0] ?? null;

  return (
    <CardHoverEffect>
    <Card>
      <div className="relative">
        <CardImage
          src={listingImage}
          alt={listing.title}
          fallbackIcon={Store}
          height={160}
        />
        {showFavoriteButton && (
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton itemId={listing.id} type="marketplace" variant="ghost" size="sm" />
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col gap-4 relative">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold leading-tight overflow-hidden text-ellipsis whitespace-nowrap text-base">
                {listing.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {listing.business_name}
              </p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant="secondary">{listing.category}</Badge>
              {listing.featured && <div className="w-2 h-2 bg-foreground" />}
            </div>
          </div>

          {/* Location */}
          {(listing.venues?.name || listing.location) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin style={{ height: 12, width: 12, flexShrink: 0 }} />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {listing.venues
                  ? `${listing.venues.name}, ${listing.venues.city}`
                  : listing.location}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        {listing.description && (
          <p
            className="text-sm text-muted-foreground overflow-hidden leading-normal"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          >
            {listing.description}
          </p>
        )}

        {/* Price and Rating */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-base font-bold">{formatPrice()}</p>
            {listing.shipping_available && <Badge variant="outline">Ships</Badge>}
          </div>

          {averageRating > 0 && (
            <div className="flex items-center gap-1">
              <Star style={{ height: 14, width: 14 }} fill="currentColor" />
              <p className="text-sm font-medium">{averageRating.toFixed(1)}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1">
            {listing.website && (
              <Button size="default" variant="ghost" aria-label="Visit website" asChild>
                <a
                  href={listing.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={ICON_LINK_STYLE}
                >
                  <ExternalLink style={{ height: 16, width: 16 }} aria-hidden="true" />
                </a>
              </Button>
            )}
            {listing.contact_phone && (
              <Button
                size="default"
                variant="ghost"
                aria-label={`Call ${listing.contact_phone}`}
                asChild
              >
                <a href={`tel:${listing.contact_phone}`} onClick={(e) => e.stopPropagation()} style={ICON_LINK_STYLE}>
                  <Phone style={{ height: 16, width: 16 }} aria-hidden="true" />
                </a>
              </Button>
            )}
            {listing.contact_email && (
              <Button
                size="default"
                variant="ghost"
                aria-label={`Email ${listing.contact_email}`}
                asChild
              >
                <a href={`mailto:${listing.contact_email}`} onClick={(e) => e.stopPropagation()} style={ICON_LINK_STYLE}>
                  <Mail style={{ height: 16, width: 16 }} aria-hidden="true" />
                </a>
              </Button>
            )}

            {listing.views_count && listing.views_count > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                <Eye style={{ height: 12, width: 12 }} />
                <span>{listing.views_count}</span>
              </div>
            )}
          </div>

          <LocalizedLink to={`/marketplace/${listing.slug}`}>
            <Button size="sm">View</Button>
          </LocalizedLink>
        </div>
      </div>
    </Card>
    </CardHoverEffect>
  );
}
