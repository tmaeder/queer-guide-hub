import { useState } from 'react';
import { Card, CardImage, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, MoreVertical, Share2, Luggage } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { VenueEvents } from './VenueEvents';
import { Link } from 'react-router';
import { FavoriteButton } from '@/components/ui/favorite-button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { AddToTripMenuItem } from '@/components/trips/AddToTripMenuItem';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';

type Venue = Database['public']['Tables']['venues']['Row'];
type Event = Database['public']['Tables']['events']['Row'];

interface VenueCardProps {
  venue?: Venue & {
    venue_reviews?: Array<{
      rating: number;
    }>;
  };
  loading?: boolean;
  events?: Event[];
  onViewDetails?: (venue: Venue) => void;
  onAmenityClick?: (amenity: string) => void;
  onServiceClick?: (service: string) => void;
  onTagClick?: (tag: string) => void;
}

const VenueCardFixture = () => (
  <Card hoverable style={{ overflow: 'hidden' }}>
    <CardImage src="" alt="Venue" fallbackIcon={MapPin} />
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>Sample Venue Name</Typography>
          <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>bar</Badge>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <MapPin style={{ width: 16, height: 16 }} />
          <Typography variant="body2">Berlin, Germany</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>LGBTQ+</Badge>
          <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>Nightlife</Badge>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
          <Box sx={{ width: 32, height: 32 }} />
        </Box>
      </Box>
    </Box>
  </Card>
);

export function VenueCard({
  venue,
  loading = false,
  events = [],
  onViewDetails,
  onAmenityClick,
  onServiceClick,
  onTagClick,
}: VenueCardProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const { data: tripStatus } = useEntityTripStatus('venue', venue?.id);

  const averageRating = venue?.venue_reviews?.length
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
    <Skeleton
      name="venue-card"
      loading={loading || !venue}
      fixture={<VenueCardFixture />}
      fallback={<PageLoadingState count={1} />}
    >
      {venue && (
        <Link
          to={`/venues/${venue.slug}`}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <Card hoverable style={{ overflow: 'hidden' }}>
            <Box sx={{ position: 'relative' }}>
              <CardImage src={venue.images?.[0]} alt={venue.name} fallbackIcon={MapPin} />
              {venue.logo_url && (
                <Box
                  component="img"
                  src={venue.logo_url}
                  alt=""
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    width: 32,
                    height: 32,
                    borderRadius: '8px',
                    bgcolor: 'background.paper',
                    objectFit: 'contain',
                    boxShadow: 1,
                    p: '2px',
                  }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              {tripStatus?.isInTrip && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    borderRadius: 4,
                    px: 1,
                    py: 0.25,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                >
                  <Luggage style={{ width: 12, height: 12 }} />
                  In trip
                </Box>
              )}
            </Box>

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
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
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
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuAnchor(e.currentTarget);
                    }}
                    sx={{ ml: 'auto' }}
                  >
                    <MoreVertical style={{ width: 16, height: 16 }} />
                  </IconButton>
                  <Menu
                    anchorEl={menuAnchor}
                    open={Boolean(menuAnchor)}
                    onClose={(e: any) => {
                      e?.stopPropagation?.();
                      setMenuAnchor(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AddToTripMenuItem
                      entity={{
                        type: 'venue',
                        id: venue.id,
                        name: venue.name,
                        latitude: venue.latitude,
                        longitude: venue.longitude,
                        city_id: venue.city_id,
                        country_id: venue.country_id,
                        address: venue.address,
                        category: venue.category,
                      }}
                      onClose={() => setMenuAnchor(null)}
                    />
                    <MuiMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setMenuAnchor(null);
                        navigator.clipboard.writeText(
                          `${window.location.origin}/venues/${venue.slug}`,
                        );
                      }}
                    >
                      <ListItemIcon>
                        <Share2 style={{ width: 18, height: 18 }} />
                      </ListItemIcon>
                      <ListItemText>Share</ListItemText>
                    </MuiMenuItem>
                  </Menu>
                </Box>
              </Box>
            </Box>
          </Card>
        </Link>
      )}
    </Skeleton>
  );
}
