import React from 'react';
import { formatCurrency } from '@/lib/currency';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MotionCard as Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Globe, Phone, Mail, ExternalLink, Eye } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { Link } from 'react-router';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

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
}

export function MarketplaceCard({
  listing,
  loading = false,
  _onViewDetails,
  _onToggleFavorite,
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

  const _isFavorited = listing.marketplace_favorites && listing.marketplace_favorites.length > 0;

  const _getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      products: 'bg-muted text-foreground',
      services: 'bg-muted text-foreground',
    };
    return colors[category] || 'bg-muted text-foreground';
  };

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

  const _getBusinessTypeIcon = (type: string) => {
    switch (type) {
      case 'online':
        return <Globe style={{ height: 12, width: 12 }} />;
      case 'physical':
        return <MapPin style={{ height: 12, width: 12 }} />;
      case 'both':
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Globe style={{ height: 12, width: 12 }} />
            <MapPin style={{ height: 12, width: 12 }} />
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      sx={{
        position: 'relative',
        overflow: 'hidden',
        transition: 'opacity 0.2s',
        bgcolor: 'background.paper',
      }}
    >
      {showFavoriteButton && (
        <Box sx={{ position: 'absolute', top: 3, right: 3, zIndex: 10 }}>
          <FavoriteButton
            itemId={listing.id}
            type="marketplace"
            variant="ghost"
            size="sm"
            sx={{ bgcolor: 'background.default' }}
          />
        </Box>
      )}

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
              <Badge variant="secondary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                {listing.category}
              </Badge>
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
            {listing.shipping_available && (
              <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                Ships
              </Badge>
            )}
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
              <Button
                size="sm"
                variant="ghost"
                sx={{ height: 28, width: 28, p: 0 }}
                aria-label="Visit website"
                asChild
              >
                <a
                  href={listing.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink style={{ height: 12, width: 12 }} />
                </a>
              </Button>
            )}
            {listing.contact_phone && (
              <Button
                size="sm"
                variant="ghost"
                sx={{ height: 28, width: 28, p: 0 }}
                aria-label={`Call ${listing.contact_phone}`}
                asChild
              >
                <a href={`tel:${listing.contact_phone}`} onClick={(e) => e.stopPropagation()}>
                  <Phone style={{ height: 12, width: 12 }} />
                </a>
              </Button>
            )}
            {listing.contact_email && (
              <Button
                size="sm"
                variant="ghost"
                sx={{ height: 28, width: 28, p: 0 }}
                aria-label={`Email ${listing.contact_email}`}
                asChild
              >
                <a href={`mailto:${listing.contact_email}`} onClick={(e) => e.stopPropagation()}>
                  <Mail style={{ height: 12, width: 12 }} />
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

          <Link to={`/marketplace/${listing.slug}`}>
            <Button size="sm" sx={{ height: 28, fontSize: '0.75rem' }}>
              View
            </Button>
          </Link>
        </Box>
      </Box>
    </Card>
  );
}
