import { Card, CardImage } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FavoriteButton } from '@/components/ui/favorite-button';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { Luggage } from 'lucide-react';
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>Sample Venue Name</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
          <MapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
          <Typography variant="body2">Berlin, Germany</Typography>
        </Box>
      </Box>
    </Box>
  </Card>
);

export function VenueCard({
  venue,
  loading = false,
}: VenueCardProps) {
  const { data: tripStatus } = useEntityTripStatus('venue', venue?.id);

  const venueImage = venue?.images?.[0] ?? venue?.logo_url ?? null;

  return (
    <Skeleton
      name="venue-card"
      loading={loading || !venue}
      fixture={<VenueCardFixture />}
      fallback={<PageLoadingState count={1} />}
    >
      {venue && (
        <LocalizedLink
          to={`/venues/${venue.slug}`}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <Card
            hoverable
            style={{ overflow: 'hidden' }}

          >
            <Box sx={{ position: 'relative' }}>
              <CardImage
                src={venueImage}
                alt={venue.name}
                fallbackIcon={MapPin}
                height={160}
              />

              {/* Category label — top left */}
              {venue.category && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    bgcolor: 'hsl(var(--foreground) / 0.6)',
                    color: 'hsl(var(--background))',
                    borderRadius: 1,
                    px: 1,
                    py: 0.25,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {venue.category}
                </Box>
              )}

              {/* Favorite — top right */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <FavoriteButton itemId={venue.id} type="venue" />
              </Box>

              {/* Closed badge */}
              {venue.closed_at && new Date(venue.closed_at) <= new Date() && (
                <Box sx={{ position: 'absolute', top: 8, right: 44 }}>
                  <Chip label="Closed" color="error" size="small" sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
                </Box>
              )}

              {/* Trip badge */}
              {tripStatus?.isInTrip && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 8,
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

              {/* Logo overlay */}
              {venue.logo_url && (
                <Box
                  component="img"
                  src={venue.logo_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
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
            </Box>

            <Box sx={{ p: 1.5 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {venue.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, color: 'text.secondary' }}>
                <MapPin style={{ width: 13, height: 13, flexShrink: 0 }} />
                <Typography
                  variant="caption"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {[venue.city, venue.state].filter(Boolean).join(', ')}
                </Typography>
              </Box>
            </Box>
          </Card>
        </LocalizedLink>
      )}
    </Skeleton>
  );
}
