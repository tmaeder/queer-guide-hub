import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Phone, Globe, Instagram, Eye } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { VenueEvents } from './VenueEvents';
import { Link } from 'react-router-dom';
import { FavoriteButton } from '@/components/ui/favorite-button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

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
    <Link to={`/venues/${venue.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <Paper
        elevation={2}
        sx={{
          overflow: 'hidden',
          transition: 'all 0.3s',
          cursor: 'pointer',
          '&:hover': {
            boxShadow: 8,
            transform: 'translateY(-4px)'
          }
        }}
      >
      {/* Venue Image */}
      {venue.images && venue.images.length > 0 ? (
        <Box sx={{ position: 'relative', height: 192, overflow: 'hidden' }}>
          <Box
            component="img"
            src={venue.images[0]}
            alt={venue.name}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.3s',
              '&:hover': { transform: 'scale(1.05)' }
            }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        </Box>
      ) : (
        <Box sx={{ height: 192, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MapPin style={{ width: 32, height: 32, color: 'var(--muted-foreground)' }} />
        </Box>
      )}

      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Title and Category */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                lineHeight: 1.2,
                transition: 'color 0.2s',
                '&:hover': { color: 'primary.main' }
              }}
            >
              {venue.name}
            </Typography>
            <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
              {venue.category}
            </Badge>
          </Box>

          {/* Location */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
            <MapPin style={{ width: 16, height: 16 }} />
            <Typography variant="body2">{venue.city}, {venue.state}</Typography>
          </Box>

          {/* Tags (max 2) */}
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
                    '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' }
                  }}
                  onClick={() => onTagClick?.(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </Box>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
            <FavoriteButton itemId={venue.id} type="venue" />
          </Box>
        </Box>
      </Box>
      </Paper>
    </Link>
  );
}
