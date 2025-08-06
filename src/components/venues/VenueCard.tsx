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
  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      {/* Venue Image */}
      {venue.images && venue.images.length > 0 ? (
        <div className="relative h-48 overflow-hidden">
          <img 
            src={venue.images[0]} 
            alt={venue.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
            onError={e => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }} 
          />
        </div>
      ) : (
        <div className="h-48 bg-muted flex items-center justify-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Title and Category */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
              {venue.name}
            </h3>
            <Badge variant="secondary" className="text-xs">
              {venue.category}
            </Badge>
          </div>
          
          {/* Location */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">{venue.city}, {venue.state}</span>
          </div>
          
          {/* Tags (max 2) */}
          {venue.tags && venue.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {venue.tags.slice(0, 2).map((tag, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors" 
                  onClick={() => onTagClick?.(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          
          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <FavoriteButton itemId={venue.id} type="venue" />
            <Link to={`/venues/${venue.id}`}>
              <Button size="sm" variant="outline">
                View Details
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}