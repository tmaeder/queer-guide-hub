import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardImage, CardContent } from '@/components/ui/card';
import type { DiscoverableTrip } from '@/hooks/useDiscoverableTrips';

interface Props {
  trip: DiscoverableTrip;
}

/**
 * Compact card for the public discovery feed. Differs from `TripCard`
 * (which is owner-focused with menus + delete) by stripping all
 * mutation surfaces and surfacing what a stranger needs to decide
 * whether the trip is worth reading: cover, title, dates, owner,
 * cities visited, place count.
 */
export function PublicTripCard({ trip }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();

  const dateRange = (() => {
    if (!trip.start_date || !trip.end_date) return null;
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return `${format(start, 'MMM d')}–${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  })();

  const onOpen = () => navigate(`/trips/${trip.id}`);

  return (
    <Card
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      sx={{
        cursor: 'pointer',
        transition: 'transform 0.15s, opacity 0.15s',
        '&:hover': { opacity: 0.9 },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'brand.main', outlineOffset: 2 },
      }}
    >
      {trip.cover_image_url && (
        <CardImage src={trip.cover_image_url} alt={trip.title} height={160} />
      )}
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }} noWrap>
          {trip.title}
        </Typography>

        {trip.description && (
          <Typography
            color="text.secondary"
            sx={{
              fontSize: 13,
              mb: 1,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {trip.description}
          </Typography>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
          {dateRange && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
              <Calendar size={12} />
              <Typography variant="caption">{dateRange}</Typography>
            </Box>
          )}
          {trip.cities.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
              <MapPin size={12} />
              <Typography variant="caption" noWrap>
                {trip.cities.slice(0, 4).join(', ')}
                {trip.cities.length > 4 && ` +${trip.cities.length - 4}`}
              </Typography>
            </Box>
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 1.5,
            pt: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Avatar
            src={trip.owner?.avatar_url ?? undefined}
            alt={trip.owner?.display_name ?? ''}
            sx={{ width: 22, height: 22, fontSize: 11 }}
          >
            {(trip.owner?.display_name ?? '?').slice(0, 1).toUpperCase()}
          </Avatar>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
            {trip.owner?.display_name ?? t('trips.discover.anonymous', 'A QG traveler')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('trips.discover.placeCount', {
              count: trip.place_count,
              defaultValue: '{{count}} places',
            })}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
