import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Globe, Phone, Mail, ExternalLink, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MedusaListing } from '@/hooks/useMedusaMarketplace';

interface MarketplaceCardProps {
  listing: MedusaListing;
  onViewDetails?: (listing: MedusaListing) => void;
  onToggleFavorite?: (listingId: string) => void;
  showFavoriteButton?: boolean;
}

export function MarketplaceCard({ 
  listing, 
  onViewDetails, 
  onToggleFavorite, 
  showFavoriteButton = false 
}: MarketplaceCardProps) {
  const averageRating = 0;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      products: 'bg-primary/10 text-primary',
      services: 'bg-accent/10 text-accent',
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
    <Card className="group hover:shadow-lg transition-all duration-200 border-0 bg-card/50 backdrop-blur-sm relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

        <div className="p-6 space-y-4 relative">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-base leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                  {listing.title}
                </h3>
                {listing.business_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {listing.business_name}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary" className="text-xs font-medium">
                  {listing.category || 'products'}
                </Badge>
                {listing.featured && (
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                )}
              </div>
            </div>

            {/* Location */}
            {listing.venues?.name && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {`${listing.venues.name}, ${listing.venues.city}`}
                </span>
              </div>
            )}
          </div>

        {/* Description */}
        {listing.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {listing.description}
          </p>
        )}

        {/* Price and Rating */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">
              {formatPrice()}
            </span>
            {listing.shipping_available && (
              <Badge variant="outline" className="text-xs border-muted">
                Ships
              </Badge>
            )}
          </div>

          {averageRating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-accent text-accent" />
              <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1">
            {listing.website && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-muted/50" asChild>
                <a href={listing.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
          
          <Link to={`/marketplace/${listing.id}`}>
            <Button size="sm" className="h-7 text-xs bg-primary/90 hover:bg-primary">
              View
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}