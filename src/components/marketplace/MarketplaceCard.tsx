import type { CSSProperties } from 'react';
import { formatCurrency } from '@/lib/currency';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MotionCard as Card, CardImage } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Phone, Mail, ExternalLink, Eye, Store } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
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
    : 0;  const formatPrice = () => {
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
    <Card>
      <Box sx={{ position: 'relative' }}>
        <CardImage
          src={listingImage}
          alt={listing.title}
          fallbackIcon={Store}
          height={160}
        />
        {showFavoriteButton && (
          <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
            <FavoriteButton itemId={listing.id} type="marketplace" variant="ghost" size="sm" />
          </Box>
        )}
      </Box>

      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1.5,
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {listing.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {listing.business_name}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Badge variant="secondary">{listing.category}</Badge>
              {listing.featured && <Box sx={{ width: 8, height: 8, bgcolor: 'text.primary' }} />}
            </Box>
          </Box>

          {/* Location */}
          {(listing.venues?.name || listing.location) && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              <MapPin style={{ height: 12, width: 12, flexShrink: 0 }} />
              <Typography
                variant="caption"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {listing.venues
                  ? `${listing.venues.name}, ${listing.venues.city}`
                  : listing.location}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Description */}
        {listing.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.5,
            }}
          >
            {listing.description}
          </Typography>
        )}

        {/* Price and Rating */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              {formatPrice()}
            </Typography>
            {listing.shipping_available && <Badge variant="outline">Ships</Badge>}
          </Box>

          {averageRating > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Star style={{ height: 14, width: 14 }} fill="currentColor" />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {averageRating.toFixed(1)}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  ml: 1,
                }}
              >
                <Eye style={{ height: 12, width: 12 }} />
                <Typography variant="caption">{listing.views_count}</Typography>
              </Box>
            )}
          </Box>

          <LocalizedLink to={`/marketplace/${listing.slug}`}>
            <Button size="sm">View</Button>
          </LocalizedLink>
        </Box>
      </Box>
    </Card>
  );
}
