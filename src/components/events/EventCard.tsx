import React, { memo } from 'react';
import { Card, CardImage, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  DollarSign,
  ExternalLink,
  Star,
  Ticket,
  Heart,
  Eye,
} from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { Link } from 'react-router';
import { formatEventTime } from '@/lib/event-time';
import { FavoriteButton } from '@/components/ui/favorite-button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

type Event = Database['public']['Tables']['events']['Row'] & {
  venues?: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
  } | null;
};

interface EventCardProps {
  event?: Event & {
    event_attendees?: Array<{ status: string }>;
  };
  loading?: boolean;
  onViewDetails?: (event: Event) => void;
  onUpdateAttendance?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}

const EventCardFixture = () => (
  <Card hoverable>
    <CardImage src="" alt="Event" fallbackIcon={Calendar} height={200} />
    <CardHeader sx={{ pb: 2 }}>
      <CardTitle sx={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Sample Event Title</CardTitle>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Calendar style={{ height: 16, width: 16 }} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>Jun 15, 2026</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Clock style={{ height: 16, width: 16 }} />
          <Typography variant="body2">8:00 PM</Typography>
        </Box>
      </Box>
    </CardHeader>
    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}>
      <Typography variant="body2" color="text.secondary">A sample event description spanning a couple of lines.</Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
        <MapPin style={{ height: 16, width: 16, marginTop: 2, flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>Sample Venue</Typography>
          <Typography variant="caption" color="text.secondary">Berlin, Germany</Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>12 attending</Typography>
        <Box sx={{ width: 32, height: 32 }} />
      </Box>
    </CardContent>
  </Card>
);

export const EventCard = memo(function EventCard({ event, loading = false, onViewDetails, onUpdateAttendance }: EventCardProps) {
  const attendeeCount = event?.event_attendees?.filter((a) => a.status === 'going').length || 0;

  const getEventTypeStyle = (type: string): React.CSSProperties => {
    const styles: Record<string, React.CSSProperties> = {
      party: { backgroundColor: 'rgba(var(--primary-rgb), 0.1)', color: 'hsl(var(--primary))' },
      workshop: { backgroundColor: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' },
      meetup: { backgroundColor: 'rgba(var(--secondary-rgb), 0.1)', color: 'var(--secondary)' },
      pride: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' },
      rally: { backgroundColor: 'rgba(var(--destructive-rgb), 0.1)', color: 'var(--destructive)' },
    };
    return (
      styles[type] || {
        backgroundColor: 'rgba(var(--muted-rgb), 0.1)',
        color: 'var(--muted-foreground)',
      }
    );
  };

  const formatEventDate = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;

    if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    return format(start, 'MMM d, yyyy');
  };

  const getPriceDisplay = () => {
    if (event.is_free) return 'Free';
    if (event.price_min && event.price_max) {
      if (event.price_min === event.price_max) {
        return `$${event.price_min}`;
      }
      return `$${event.price_min} - $${event.price_max}`;
    }
    if (event.price_min) return `From $${event.price_min}`;
    return 'Price TBA';
  };

  return (
    <Skeleton name="event-card" loading={loading || !event} fixture={<EventCardFixture />} fallback={<PageLoadingState count={1} />}>
      {event && (
    <Link to={`/events/${event.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
    <Card hoverable>
      <CardImage
        src={event.images?.[0]}
        alt={event.title}
        fallbackIcon={Calendar}
        height={200}
      >
        {/* Overlay Badges */}
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            zIndex: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Box sx={{ display: 'flex', gap: 1 }}>
            {event.featured && (
              <Badge sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                <Star style={{ height: 12, width: 12, marginRight: 4 }} />
                Featured
              </Badge>
            )}
            <Badge style={{ ...getEventTypeStyle(event.event_type) }}>{event.event_type}</Badge>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {event.images && event.images.length > 1 && (
              <Badge variant="secondary" sx={{ bgcolor: 'action.hover', color: 'text.primary' }}>
                +{event.images.length - 1} photos
              </Badge>
            )}
          </Box>
        </Box>

        {/* Price Badge */}
        <Box sx={{ position: 'absolute', bottom: 16, right: 16, zIndex: 20 }}>
          {event.is_free ? (
            <Badge
              sx={{
                bgcolor: 'success.main',
                color: 'success.contrastText',
                fontSize: '0.875rem',
                px: 1.5,
                py: 0.5,
              }}
            >
              <Ticket style={{ height: 12, width: 12, marginRight: 4 }} />
              Free
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              sx={{
                bgcolor: 'action.hover',
                color: 'text.primary',
                fontSize: '0.875rem',
                px: 1.5,
                py: 0.5,
              }}
            >
              <DollarSign style={{ height: 12, width: 12, marginRight: 4 }} />
              {getPriceDisplay()}
            </Badge>
          )}
        </Box>
      </CardImage>

      <CardHeader sx={{ pb: 2 }}>
        <CardTitle
          sx={{
            fontSize: '1.25rem',
            fontWeight: 'bold',
            lineHeight: 1.25,
            transition: 'color 0.3s',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {event.title}
        </CardTitle>

        {/* Date and Time Info */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                bgcolor: 'action.hover',
                borderRadius: 2,
              }}
            >
              <Calendar style={{ height: 16, width: 16, color: 'var(--primary)' }} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {formatEventDate(event.start_date, event.end_date)}
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                bgcolor: 'action.hover',
                borderRadius: 2,
              }}
            >
              <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Typography variant="body2">
                {formatEventTime(event.start_date, event.end_date)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardHeader>

      <CardContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          pt: 0,
        }}
      >
        {/* Description */}
        {event.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.6,
            }}
          >
            {event.description}
          </Typography>
        )}

        {/* Location */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            p: 1.5,
            bgcolor: 'action.hover',
            borderRadius: 2,
          }}
        >
          <MapPin
            style={{ height: 16, width: 16, color: 'var(--primary)', marginTop: 2, flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {event.venues?.name || event.venue_name || 'Location TBA'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {event.city}, {event.state}
            </Typography>
            {event.venues?.address && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: 'block' }}
              >
                {event.venues.address}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Event Stats */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ p: 0.75, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Users style={{ height: 12, width: 12, color: 'var(--primary)' }} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {attendeeCount} attending
              </Typography>
            </Box>

            {event.age_restriction && (
              <Badge
                variant="outline"
                sx={{ fontSize: '0.75rem', bgcolor: 'rgba(var(--muted-rgb), 0.5)' }}
              >
                {event.age_restriction}
              </Badge>
            )}
          </Box>

          <Box onClick={(e) => e.preventDefault()}>
            <FavoriteButton itemId={event.id} type="event" />
          </Box>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            size="sm"
            variant="outline"
            sx={{
              flex: 1,
              transition: 'all 0.3s',
              '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' },
            }}
          >
            <Eye
              style={{ height: 16, width: 16, marginRight: 8 }}
            />
            View Details
          </Button>

          {/* External Links */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {event.venues?.website && (
              <Button
                size="sm"
                variant="outline"
                sx={{ px: 1.5, '&:hover': { bgcolor: 'rgba(var(--primary-rgb), 0.1)' } }}
                asChild
              >
                <a
                  href={event.venues.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.open(event.venues!.website!, '_blank'); }}
                >
                  <ExternalLink style={{ height: 16, width: 16 }} />
                </a>
              </Button>
            )}
            {event.ticket_url && (
              <Button
                size="sm"
                variant="default"
                sx={{ px: 1.5, bgcolor: 'primary.main', '&:hover': { opacity: 0.9 } }}
                asChild
              >
                <a
                  href={event.ticket_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.open(event.ticket_url!, '_blank'); }}
                >
                  <Ticket style={{ height: 16, width: 16 }} />
                </a>
              </Button>
            )}
          </Box>
        </Box>

        {/* Attendance Buttons */}
        {onUpdateAttendance && (
          <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
            <Button
              size="sm"
              variant="default"
              sx={{
                flex: 1,
                bgcolor: 'success.main',
                color: 'success.contrastText',
                '&:hover': { opacity: 0.9 },
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onUpdateAttendance(event.id, 'going');
              }}
            >
              <Heart style={{ height: 16, width: 16, marginRight: 8 }} />
              I'm Going
            </Button>
            <Button
              size="sm"
              variant="outline"
              sx={{ flex: 1, '&:hover': { opacity: 0.9 } }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onUpdateAttendance(event.id, 'interested');
              }}
            >
              <Star style={{ height: 16, width: 16, marginRight: 8 }} />
              Interested
            </Button>
          </Box>
        )}

        {/* Venue Contact Info */}
        {event.venues?.phone && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}
          >
            Contact: {event.venues.phone}
          </Typography>
        )}
      </CardContent>

    </Card>
    </Link>
      )}
    </Skeleton>
  );
});
