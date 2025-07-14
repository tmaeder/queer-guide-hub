import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Heart, MapPin, Globe, Phone, Mail, ExternalLink, Eye } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { Link } from 'react-router-dom';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

interface MarketplaceCardProps {
  listing: MarketplaceListing & {
    marketplace_reviews?: Array<{ rating: number }>;
    marketplace_favorites?: Array<{ id: string }>;
  };
  onViewDetails?: (listing: MarketplaceListing) => void;
  onToggleFavorite?: (listingId: string) => void;
  showFavoriteButton?: boolean;
}

export function MarketplaceCard({ 
  listing, 
  onViewDetails, 
  onToggleFavorite, 
  showFavoriteButton = false 
}: MarketplaceCardProps) {
  const averageRating = listing.marketplace_reviews?.length 
    ? listing.marketplace_reviews.reduce((sum, review) => sum + review.rating, 0) / listing.marketplace_reviews.length
    : 0;

  const isFavorited = listing.marketplace_favorites && listing.marketplace_favorites.length > 0;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      products: 'bg-primary/10 text-primary',
      services: 'bg-accent/10 text-accent',
      classes: 'bg-secondary/10 text-secondary',
      events: 'bg-destructive/10 text-destructive',
    };
    return colors[category] || 'bg-muted/10 text-muted-foreground';
  };

  const formatPrice = () => {
    if (!listing.price) {
      if (listing.price_type === 'free') return 'Free';
      return 'Price varies';
    }

    const price = `$${listing.price}`;
    
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

  const getBusinessTypeIcon = (type: string) => {
    switch (type) {
      case 'online':
        return <Globe className="h-3 w-3" />;
      case 'physical':
        return <MapPin className="h-3 w-3" />;
      case 'both':
        return (
          <div className="flex gap-1">
            <Globe className="h-3 w-3" />
            <MapPin className="h-3 w-3" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="group hover:shadow-elegant transition-all duration-300 relative">
      
      {/* Favorite Button */}
      {showFavoriteButton && onToggleFavorite && (
        <Button
          size="sm"
          variant="ghost"
          className={`absolute top-2 right-2 z-10 h-8 w-8 p-0 ${
            isFavorited ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-red-500'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(listing.id);
          }}
        >
          <Heart className={`h-4 w-4 ${isFavorited ? 'fill-current' : ''}`} />
        </Button>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg group-hover:text-primary transition-colors line-clamp-2">
              {listing.title}
              {listing.featured && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Featured
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-medium text-sm">{listing.business_name}</span>
              {listing.business_type && getBusinessTypeIcon(listing.business_type)}
            </div>
            {listing.location && (
              <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span className="text-sm">{listing.location}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={getCategoryColor(listing.category)}>
              {listing.category}
            </Badge>
            {listing.subcategory && (
              <Badge variant="outline" className="text-xs">
                {listing.subcategory}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {listing.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {listing.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-primary">
              {formatPrice()}
            </span>
            {listing.shipping_available && (
              <Badge variant="outline" className="text-xs">
                Ships
              </Badge>
            )}
          </div>

          {averageRating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-current text-accent" />
              <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">
                ({listing.marketplace_reviews?.length})
              </span>
            </div>
          )}
        </div>

        {listing.tags && listing.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {listing.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{listing.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {listing.contact_phone && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                <Phone className="h-3 w-3" />
              </Button>
            )}
            {listing.contact_email && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                <Mail className="h-3 w-3" />
              </Button>
            )}
            {listing.website && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" asChild>
                <a href={listing.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            {listing.views_count && listing.views_count > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                <span>{listing.views_count}</span>
              </div>
            )}
          </div>
          
          <Link to={`/marketplace/${listing.id}`}>
            <Button size="sm" variant="outline" className="text-xs">
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}