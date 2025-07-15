import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Phone, Globe, Instagram } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { VenueEvents } from './VenueEvents';
import { Link } from 'react-router-dom';

type Venue = Database['public']['Tables']['venues']['Row'];
type Event = Database['public']['Tables']['events']['Row'];

interface VenueCardProps {
  venue: Venue & {
    venue_reviews?: Array<{ rating: number }>;
  };
  events?: Event[];
  onViewDetails?: (venue: Venue) => void;
  onAmenityClick?: (amenity: string) => void;
  onServiceClick?: (service: string) => void;
}

export function VenueCard({ venue, events = [], onViewDetails, onAmenityClick, onServiceClick }: VenueCardProps) {
  const averageRating = venue.venue_reviews?.length 
    ? venue.venue_reviews.reduce((sum, review) => sum + review.rating, 0) / venue.venue_reviews.length
    : 0;

  const getPriceRange = (range: number | null) => {
    if (!range) return '';
    return '$'.repeat(range);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      bar: 'bg-primary/10 text-primary',
      restaurant: 'bg-accent/10 text-accent',
      cafe: 'bg-secondary/10 text-secondary',
      club: 'bg-destructive/10 text-destructive',
      hotel: 'bg-muted-foreground/10 text-muted-foreground',
    };
    return colors[category] || 'bg-muted/10 text-muted-foreground';
  };

  return (
    <Card className="group hover:shadow-elegant transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg group-hover:text-primary transition-colors">
              {venue.name}
              {venue.verified && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Verified
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="text-sm">{venue.city}, {venue.state}</span>
              {venue.price_range && (
                <span className="text-sm font-medium text-accent">
                  {getPriceRange(venue.price_range)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={getCategoryColor(venue.category)}>
              {venue.category}
            </Badge>
            {averageRating > 0 && (
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-current text-accent" />
                <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {venue.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {venue.description}
          </p>
        )}

        {venue.tags && venue.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {venue.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {venue.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{venue.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {venue.amenities && venue.amenities.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Amenities:</span>
            <div className="flex flex-wrap gap-1">
              {venue.amenities.slice(0, 4).map((amenity, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="text-xs cursor-pointer hover:bg-accent/20 transition-colors"
                  onClick={() => onAmenityClick?.(amenity)}
                >
                  {amenity}
                </Badge>
              ))}
              {venue.amenities.length > 4 && (
                <Badge variant="secondary" className="text-xs">
                  +{venue.amenities.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {venue.services && venue.services.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Services:</span>
            <div className="flex flex-wrap gap-1">
              {venue.services.slice(0, 4).map((service, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => onServiceClick?.(service)}
                >
                  {service}
                </Badge>
              ))}
              {venue.services.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{venue.services.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        {events.length > 0 && (
          <VenueEvents 
            venueId={venue.id} 
            venueName={venue.name}
            events={events}
            compact={true}
          />
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {venue.phone && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                <Phone className="h-3 w-3" />
              </Button>
            )}
            {venue.website && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                <Globe className="h-3 w-3" />
              </Button>
            )}
            {venue.instagram && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                <Instagram className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          <Link to={`/venues/${venue.id}`}>
            <Button size="sm" variant="outline" className="text-xs">
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}