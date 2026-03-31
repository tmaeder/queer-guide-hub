import { Card, CardImage, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { VenueEvents } from './VenueEvents';
import { Link } from 'react-router';
import { FavoriteButton } from '@/components/ui/favorite-button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
  onTagClick,
}: VenueCardProps) {
  const averageRating = venue.venue_reviews?.length
    ? venue.venue_reviews.reduce((sum, review) => sum + review.rating, 0) /
      venue.venue_reviews.length
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
    <Link
      to={`/venues/${venue.id}`}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <Card hoverable style={{ overflow: 'hidden' }}>
        <CardImage
          src={venue.images?.[0]}
          alt={venue.name}
          fallbackIcon={MapPin}
        />

        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, lineHeight: 1.2 }}
              >
                {venue.name}
              </Typography>
              <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
                {venue.category}
              </Badge>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <MapPin style={{ width: 16, height: 16 }} />
              <Typography variant="body2">
                {venue.city}, {venue.state}
              </Typography>
            </Box>

            {venue.tags && venue.tags.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {venue.tags.slice(0, 2).map((tag, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    sx={{
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' },
                    }}
                    onClick={() => onTagClick?.(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </Box>
            )}

            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}
            >
              <FavoriteButton itemId={venue.id} type="venue" />
            </Box>
          </Box>
        </Box>
      </Card>
    </Link>
  );
}
