import type { RefObject } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { format } from 'date-fns';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  DollarSign,
  ExternalLink,
  Phone,
  Globe,
  Share2,
  Send,
  Download,
  Tag,
  Music,
  Luggage,
  Navigation2,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { EntityMap } from '@/components/map/EntityMap';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { formatEventTime } from '@/lib/event-time';
import { formatCurrency } from '@/lib/currency';
import { isMeaningfulTag } from '@/utils/eventText';

export type EventWithRelations = Database['public']['Tables']['events']['Row'] & {
  venues?: {
    id: string;
    slug?: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  cities?: { id: string; slug?: string; name: string } | null;
  countries?: {
    id: string;
    slug?: string;
    name: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, unknown> | null;
  } | null;
  festivals?: { id: string; name: string } | null;
  event_attendees?: Array<{
    id: string;
    status: string;
    user_id: string;
    profiles?: {
      display_name: string;
      avatar_url: string | null;
    };
  }>;
};

export const EVENT_SELECT_FIELDS = `
  *,
  venues (id, slug, name, address, city, state, country, phone, website, email, latitude, longitude),
  cities:city_id(id, slug, name),
  countries:country_id(id, slug, name, equality_score, lgbti_criminalization),
  festivals:festival_id(id, name)
`;

export async function fetchEvent(
  slug: string,
  userId: string | undefined,
): Promise<EventWithRelations | null> {
  let { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT_FIELDS)
    .eq('slug', slug)
    .single();

  if (error && /uuid|invalid|no rows/i.test(error.message || '')) {
    const fb = await supabase.from('events').select(EVENT_SELECT_FIELDS).eq('id', slug).single();
    data = fb.data;
    error = fb.error;
  }
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  if (!data) return null;

  if (userId) {
    const { data: attendeesData } = await supabase
      .from('event_attendees')
      .select(`id, status, user_id, profiles:user_id (display_name, avatar_url)`)
      .eq('event_id', data.id);
    return { ...data, event_attendees: attendeesData || [] } as EventWithRelations;
  }
  return { ...data, event_attendees: [] } as EventWithRelations;
}

export async function exportEventToCalendar(event: EventWithRelations) {
  const { data, error } = await supabase.functions.invoke('calendar-export', {
    body: { eventId: event.id },
  });
  if (error) throw error;
  const blob = new Blob([data], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatEventDate(startDate: string, endDate?: string | null) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
    return `${format(start, 'EEE, MMM d')} - ${format(end, 'EEE, MMM d, yyyy')}`;
  }
  return format(start, 'EEEE, MMMM d, yyyy');
}

export function getPriceDisplay(event: EventWithRelations) {
  if (event.is_free) return 'Free';
  if (event.price_min && event.price_max) {
    return event.price_min === event.price_max
      ? formatCurrency(event.price_min, event.currency)
      : `${formatCurrency(event.price_min, event.currency)} - ${formatCurrency(event.price_max, event.currency)}`;
  }
  if (event.price_min) return `From ${formatCurrency(event.price_min, event.currency)}`;
  return 'Price TBA';
}

interface HeroProps {
  event: EventWithRelations;
  cityName: string | null | undefined;
  countryName: string | null | undefined;
  cityLink: string | null;
  countryLink: string | null;
  isPast: boolean;
  showEventTz: boolean;
  setShowEventTz: (fn: (prev: boolean) => boolean) => void;
  venueRef: RefObject<HTMLDivElement>;
  tripCount?: number;
  isInTrip?: boolean;
  onAddToTrip: () => void;
  onShare: () => void;
  onExportToCalendar: () => void;
  onSendEvent: () => void;
  showSendButton: boolean;
  heroImage: string | null;
  locationLabel: string;
}

export function EventHero({
  event,
  cityName,
  countryName,
  cityLink,
  countryLink,
  isPast,
  showEventTz,
  setShowEventTz,
  venueRef,
  tripCount,
  isInTrip,
  onAddToTrip,
  onShare,
  onExportToCalendar,
  onSendEvent,
  showSendButton,
  heroImage,
  locationLabel,
}: HeroProps) {
  return (
    <>
      {heroImage && (
        <Box
          sx={{
            width: '100%',
            height: { xs: 160, md: 192 },
            borderRadius: 3,
            overflow: 'hidden',
            mb: 3,
          }}
        >
          <Box
            component="img"
            src={heroImage}
            alt={event.title}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </Box>
      )}

      {event.countries?.lgbti_criminalization && (
        <SafetyAlertBanner
          criminalization={event.countries.lgbti_criminalization}
          countryName={event.countries.name}
        />
      )}

      {isPast && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Dieses Event hat bereits stattgefunden. / This event has ended.
        </Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'flex-start' },
          justifyContent: { md: 'space-between' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: 0.5,
              flexWrap: 'wrap',
              pl: '2px',
            }}
          >
            {event.logo_url && (
              <Box
                component="img"
                src={event.logo_url}
                alt=""
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '10px',
                  objectFit: 'contain',
                  p: '3px',
                  flexShrink: 0,
                }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                minWidth: 0,
                flex: { xs: '1 1 100%', sm: '1 1 auto' },
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                pl: '1px',
              }}
            >
              {event.title}
            </Typography>
            {event.is_featured && (
              <Badge style={{ backgroundColor: '#333333', color: '#ffffff' }}>Featured</Badge>
            )}
            {event.countries?.equality_score != null && (
              <EqualityScoreBadge score={event.countries.equality_score} size="sm" />
            )}
          </Box>
          {event.festivals?.id && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Music style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
              <Typography variant="body2" color="text.secondary">
                Part of{' '}
                <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
                  {event.festivals.name}
                </Typography>
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <MapPin style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">
              {event.venues?.id ? (
                <LocalizedLink
                  to={`/venues/${event.venues.slug || event.venues.id}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                  >
                    {event.venues.name}
                  </Typography>
                </LocalizedLink>
              ) : (
                event.venue_name || ''
              )}
              {cityName && (
                <>
                  {event.venues?.name || event.venue_name ? ', ' : ''}
                  {cityLink ? (
                    <LocalizedLink to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                      >
                        {cityName}
                      </Typography>
                    </LocalizedLink>
                  ) : (
                    cityName
                  )}
                </>
              )}
              {countryName && (
                <>
                  {', '}
                  {countryLink ? (
                    <LocalizedLink to={countryLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                      >
                        {countryName}
                      </Typography>
                    </LocalizedLink>
                  ) : (
                    countryName
                  )}
                </>
              )}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}
        >
          <FavoriteButton itemId={event.id} type="event" size="md" />
          {!isPast && (
            <Button variant="outline" size="sm" onClick={onAddToTrip}>
              <Luggage style={{ width: 14, height: 14, marginRight: 6 }} />
              Add to Trip
            </Button>
          )}
          {!isPast && isInTrip && (
            <Badge variant="secondary">
              In {tripCount} trip{tripCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <ReportButton contentType="events" contentId={event.id} contentName={event.title} />
          <AdminEditButton
            contentType="events"
            contentId={event.id}
            contentName={event.title}
            currentData={event as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          {event.ticket_url && (
            <Button size="sm" asChild>
              <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                Get Tickets
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onExportToCalendar}>
            <Download style={{ width: 16, height: 16, marginRight: 6 }} />
            Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={onShare}>
            <Share2 style={{ width: 16, height: 16, marginRight: 6 }} />
            Share
          </Button>
          {showSendButton && (
            <Button variant="outline" size="sm" onClick={onSendEvent}>
              <Send style={{ width: 16, height: 16, marginRight: 6 }} />
              Send
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
        <Chip
          icon={<Calendar style={{ width: 14, height: 14 }} />}
          label={formatEventDate(event.start_date, event.end_date)}
          size="small"
          variant="outlined"
        />
        <Chip
          icon={<Clock style={{ width: 14, height: 14 }} />}
          label={formatEventTime(
            event.start_date,
            event.end_date,
            showEventTz ? event.timezone : null,
          )}
          size="small"
          variant="outlined"
          onClick={event.timezone ? () => setShowEventTz((prev) => !prev) : undefined}
          sx={event.timezone ? { cursor: 'pointer' } : undefined}
          title={
            event.timezone
              ? `Click to toggle between event timezone and your local time`
              : undefined
          }
        />
        <Chip
          icon={<MapPin style={{ width: 14, height: 14 }} />}
          label={locationLabel}
          size="small"
          variant="outlined"
          onClick={() => venueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          sx={{ cursor: 'pointer' }}
        />
        <Chip
          icon={<DollarSign style={{ width: 14, height: 14 }} />}
          label={getPriceDisplay(event)}
          size="small"
          variant="outlined"
        />
        {isMeaningfulTag(event.event_type) && (
          <Chip
            icon={<Tag style={{ width: 14, height: 14 }} />}
            label={event.event_type}
            size="small"
            sx={{ textTransform: 'capitalize' }}
          />
        )}
        {event.age_restriction && (
          <Chip label={event.age_restriction} size="small" variant="outlined" />
        )}
      </Box>

      {(() => {
        const priceUnknown = !event.is_free && !event.price_min;
        const locationUnknown = !(event.venues?.name || event.venue_name);
        const sourceUrl = event.website || event.ticket_url;
        if ((!priceUnknown && !locationUnknown) || !sourceUrl) return null;
        const missing = [priceUnknown && 'price', locationUnknown && 'location']
          .filter(Boolean)
          .join(' and ');
        return (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.5,
              mb: 3,
              p: 1.5,
              bgcolor: 'action.hover',
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {missing.charAt(0).toUpperCase() + missing.slice(1)} not listed yet —
              check the source for the latest info.
            </Typography>
            <Button size="sm" variant="outline" asChild>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ width: 14, height: 14, marginRight: 6 }} />
                Visit source
              </a>
            </Button>
          </Box>
        );
      })()}
    </>
  );
}

interface OverviewProps {
  event: EventWithRelations;
  user: { id: string } | null;
  isPast: boolean;
  userAttendance: string | null;
  onAttendanceUpdate: (status: 'going' | 'interested' | 'not_going') => void;
}

export function EventOverview({
  event,
  user,
  isPast,
  userAttendance,
  onAttendanceUpdate,
}: OverviewProps) {
  const attendeesGoing = event.event_attendees?.filter((a) => a.status === 'going') || [];
  const attendeesInterested = event.event_attendees?.filter((a) => a.status === 'interested') || [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {event.description && (
        <Card>
          <CardHeader>
            <CardTitle>About This Event</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {event.description}
            </Typography>
          </CardContent>
        </Card>
      )}

      {user && !isPast && (
        <Card>
          <CardContent style={{ paddingTop: 24 }}>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant={userAttendance === 'going' ? 'default' : 'outline'}
                onClick={() => onAttendanceUpdate('going')}
                style={{ flex: 1 }}
              >
                <Users style={{ width: 16, height: 16, marginRight: 8 }} />
                Going {userAttendance === 'going' && '✓'}
              </Button>
              <Button
                variant={userAttendance === 'interested' ? 'default' : 'outline'}
                onClick={() => onAttendanceUpdate('interested')}
                style={{ flex: 1 }}
              >
                <Users style={{ width: 16, height: 16, marginRight: 8 }} />
                Interested {userAttendance === 'interested' && '✓'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {user && (attendeesGoing.length > 0 || attendeesInterested.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>
              Attendees ({attendeesGoing.length} going, {attendeesInterested.length} interested)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendeesGoing.length > 0 && (
              <Box sx={{ mb: attendeesInterested.length > 0 ? 2 : 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  Going
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {attendeesGoing.slice(0, 12).map((attendee) => (
                    <Box
                      key={attendee.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        bgcolor: 'action.hover',
                        borderRadius: '9999px',
                        px: 1.5,
                        py: 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          bgcolor: 'primary.main',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          color: 'primary.contrastText',
                        }}
                      >
                        {attendee.profiles?.display_name?.[0] || 'U'}
                      </Box>
                      <Typography variant="caption">
                        {attendee.profiles?.display_name || 'Anonymous'}
                      </Typography>
                    </Box>
                  ))}
                  {attendeesGoing.length > 12 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ px: 1.5, py: 0.5 }}
                    >
                      +{attendeesGoing.length - 12} more
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
            {attendeesInterested.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  Interested
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {attendeesInterested.slice(0, 8).map((attendee) => (
                    <Box
                      key={attendee.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        bgcolor: 'action.hover',
                        borderRadius: '9999px',
                        px: 1.5,
                        py: 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          bgcolor: 'action.hover',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                        }}
                      >
                        {attendee.profiles?.display_name?.[0] || 'U'}
                      </Box>
                      <Typography variant="caption">
                        {attendee.profiles?.display_name || 'Anonymous'}
                      </Typography>
                    </Box>
                  ))}
                  {attendeesInterested.length > 8 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ px: 1.5, py: 0.5 }}
                    >
                      +{attendeesInterested.length - 8} more
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

interface SidebarProps {
  event: EventWithRelations;
  venueRef: RefObject<HTMLDivElement>;
  onOrganizerClick: (organizer: string) => void;
}

export function EventSidebar({ event, venueRef, onOrganizerClick }: SidebarProps) {
  const lat = event.latitude ?? event.venues?.latitude;
  const lng = event.longitude ?? event.venues?.longitude;
  const hasMap = typeof lat === 'number' && typeof lng === 'number';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {hasMap && (
        <Card ref={venueRef}>
          <CardContent>
            <EntityMap
              center={[Number(lng), Number(lat)]}
              zoom={15}
              height={200}
              markers={[
                {
                  id: event.id,
                  lat: Number(lat),
                  lng: Number(lng),
                  name: event.title ?? 'Event',
                  subtitle: event.venues?.name,
                  type: 'events',
                  primary: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Calendar style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
            <Typography variant="body2">
              {formatEventDate(event.start_date, event.end_date)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Clock style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
            <Typography variant="body2">
              {formatEventTime(event.start_date, event.end_date)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <DollarSign style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {getPriceDisplay(event)}
            </Typography>
          </Box>
          {event.max_attendees && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Users style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
              <Typography variant="body2">Max {event.max_attendees} attendees</Typography>
            </Box>
          )}
          {event.organizer_name && (
            <Box sx={{ mt: 1, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                Organizer
              </Typography>
              <Box
                component="button"
                onClick={() => onOrganizerClick(event.organizer_name!)}
                sx={{
                  fontSize: 14,
                  color: 'primary.main',
                  '&:hover': { textDecoration: 'underline' },
                  textAlign: 'left',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  p: 0,
                }}
              >
                {event.organizer_name}
              </Box>
              {event.organizer_contact && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.25 }}
                >
                  {event.organizer_contact}
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {(event.website || event.ticket_url) && (
        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent>
            {event.website && (
              <Button
                variant="outline"
                size="sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                asChild
              >
                <a href={event.website} target="_blank" rel="noopener noreferrer">
                  <Globe style={{ width: 16, height: 16, marginRight: 8 }} />
                  Event Website
                </a>
              </Button>
            )}
            {event.ticket_url && (
              <Button
                variant="outline"
                size="sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                asChild
              >
                <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                  Get Tickets
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {event.venues && (
        <Card>
          <CardHeader>
            <CardTitle>Venue</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {event.venues.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {event.venues.address}
              <br />
              {event.venues.city}
              {event.venues.state ? `, ${event.venues.state}` : ''} {event.venues.country}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              {hasMap && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation2 style={{ width: 14, height: 14, marginRight: 6 }} />
                    Directions
                  </a>
                </Button>
              )}
              {event.venues.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${event.venues.phone}`}>
                    <Phone style={{ width: 14, height: 14, marginRight: 6 }} />
                    Call
                  </a>
                </Button>
              )}
              <LocalizedLink to={`/venues/${event.venues.slug || event.venues.id}`}>
                <Button variant="outline" size="sm">
                  View Venue
                </Button>
              </LocalizedLink>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
