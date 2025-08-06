import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Phone, Globe, Instagram } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { VenueEvents } from './VenueEvents';
import { Link } from 'react-router-dom';
import { FavoriteButton } from '@/components/ui/favorite-button';
type Venue = Database['public']['Tables']['venues']['Row'];
type Event = Database['public']['Tables']['events']['Row'];
interface VenueCardProps {
  venue: Venue & {
    venue_reviews?: Array<{
      rating: number;
    }>;
  };
  events?: Event[];
  onViewDetails?: (venue: Venue) => void;
  onAmenityClick?: (amenity: string) => void;
  onServiceClick?: (service: string) => void;
  onTagClick?: (tag: string) => void;
}
export function VenueCard({
  venue,
  events = [],
  onViewDetails,
  onAmenityClick,
  onServiceClick,
  onTagClick
}: VenueCardProps) {
  const averageRating = venue.venue_reviews?.length ? venue.venue_reviews.reduce((sum, review) => sum + review.rating, 0) / venue.venue_reviews.length : 0;
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
      hotel: 'bg-muted-foreground/10 text-muted-foreground'
    };
    return colors[category] || 'bg-muted/10 text-muted-foreground';
  };
  return <Card className="group relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm hover:bg-card/80 hover:shadow-2xl hover:shadow-primary/20 transition-all duration-500 hover:-translate-y-1">
      {/* Venue Images */}
      {venue.images && venue.images.length > 0 ? (
        <div className="relative h-56 overflow-hidden">
          <img 
            src={venue.images[0]} 
            alt={venue.name} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
            onError={e => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }} 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          {venue.images.length > 1 && (
            <div className="absolute top-3 right-3 bg-background/95 backdrop-blur-sm text-foreground text-xs px-3 py-1 rounded-full border shadow-lg">
              +{venue.images.length - 1} more
            </div>
          )}
          {venue.verified && (
            <Badge className="absolute top-3 left-3 bg-primary/90 backdrop-blur-sm text-primary-foreground border-0">
              <Star className="h-3 w-3 mr-1 fill-current" />
              Verified
            </Badge>
          )}
        </div>
      ) : (
        <div className="h-56 bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center">
          <MapPin className="h-12 w-12 text-muted-foreground/30" />
        </div>
      )}
      
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors duration-300 line-clamp-1">
              {venue.name}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm truncate">{venue.city}, {venue.state}</span>
              {venue.price_range && (
                <span className="text-sm font-semibold text-primary ml-auto">
                  {getPriceRange(venue.price_range)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary" className={`${getCategoryColor(venue.category)} font-medium`}>
              {venue.category}
            </Badge>
            {averageRating > 0 && (
              <div className="flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-full">
                <Star className="h-3 w-3 fill-current text-accent" />
                <span className="text-sm font-semibold text-accent">{averageRating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {venue.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {venue.description}
          </p>
        )}

        {venue.tags && venue.tags.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {venue.tags.slice(0, 3).map((tag, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 hover:scale-105" 
                  onClick={() => onTagClick?.(tag)}
                >
                  {tag}
                </Badge>
              ))}
              {venue.tags.length > 3 && (
                <Badge variant="outline" className="text-xs bg-muted/50">
                  +{venue.tags.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {venue.amenities && venue.amenities.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amenities</span>
            <div className="flex flex-wrap gap-1.5">
              {venue.amenities.slice(0, 4).map((amenity, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs cursor-pointer hover:bg-secondary hover:text-secondary-foreground transition-all duration-200" 
                  onClick={() => onAmenityClick?.(amenity)}
                >
                  {amenity}
                </Badge>
              ))}
              {venue.amenities.length > 4 && (
                <Badge variant="outline" className="text-xs bg-muted/50">
                  +{venue.amenities.length - 4}
                </Badge>
              )}
            </div>
          </div>
        )}

        {venue.services && venue.services.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Services</span>
            <div className="flex flex-wrap gap-1.5">
              {venue.services.slice(0, 4).map((service, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground transition-all duration-200" 
                  onClick={() => onServiceClick?.(service)}
                >
                  {service}
                </Badge>
              ))}
              {venue.services.length > 4 && (
                <Badge variant="outline" className="text-xs bg-muted/50">
                  +{venue.services.length - 4}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        {events.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <VenueEvents venueId={venue.id} venueName={venue.name} events={events} compact={true} />
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-1">
            <FavoriteButton itemId={venue.id} type="venue" />
            {venue.phone && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors">
                <Phone className="h-4 w-4" />
              </Button>
            )}
            {venue.website && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors">
                <Globe className="h-4 w-4" />
              </Button>
            )}
            {venue.instagram && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors">
                <Instagram className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <Link to={`/venues/${venue.id}`}>
            <Button 
              size="sm" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-4 hover:scale-105 transition-all duration-200"
            >
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>;
}