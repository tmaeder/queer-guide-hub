import { useParams, Link, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Clock,
  DollarSign,
  ExternalLink,
  Phone,
  Globe,
  Share2,
  Download,
  ChevronRight,
  Tag,
  Music,
  Luggage,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { useAuth } from '@/hooks/useAuth';
import { Database } from '@/integrations/supabase/types';
import { formatEventTime } from '@/lib/event-time';
import { getTimezoneAbbr } from '@/utils/timezone';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { EntityMap } from '@/components/map/EntityMap';
import { toast } from '@/hooks/use-toast';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';

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
  cities?: { id: string; name: string } | null;
  countries?: {
    id: string;
    name: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, any> | null;
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

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [userAttendance, setUserAttendance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEventTz, setShowEventTz] = useState(true);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const { data: tripStatus } = useEntityTripStatus('event', event?.id);

  const fetchEventData = async () => {
    if (!slug) return;
    try {
      const selectFields = `
          *,
          venues (id, name, address, city, state, country, phone, website, email),
          cities:city_id(id, name),
          countries:country_id(id, name, equality_score, lgbti_criminalization),
          festivals:festival_id(id, name)
        `;
      let { data: eventData, error: eventError } = await supabase
        .from('events')
        .select(selectFields)
        .eq('slug', slug)
        .single();

      if (eventError && /uuid|invalid|no rows/i.test(eventError.message || '')) {
        const fallback = await supabase.from('events').select(selectFields).eq('id', slug).single();
        eventData = fallback.data;
        eventError = fallback.error;
      }

      if (eventError) throw eventError;

      if (user) {
        const { data: attendeesData } = await supabase
          .from('event_attendees')
          .select(`id, status, user_id, profiles:user_id (display_name, avatar_url)`)
          .eq('event_id', eventData.id);

        const fullEvent = { ...eventData, event_attendees: attendeesData || [] };
        setEvent(fullEvent);

        const userAttendee = attendeesData?.find((a: any) => a.user_id === user.id);
        setUserAttendance(userAttendee?.status || null);
      } else {
        setEvent({ ...eventData, event_attendees: [] });
      }
    } catch (error) {
      console.error('Error fetching event:', error);
    }
  };

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      await fetchEventData();
      setLoading(false);
    };
    load();
  }, [slug, user]);

  const handleAttendanceUpdate = async (status: 'going' | 'interested' | 'not_going') => {
    if (!user || !event) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to update your attendance',
        variant: 'destructive',
      });
      return;
    }
    try {
      const { error } = await supabase
        .from('event_attendees')
        .upsert({ event_id: event.id, user_id: user.id, status });
      if (error) throw error;
      setUserAttendance(status);
      toast({
        title: 'Attendance updated',
        description: `You're now marked as ${status.replace('_', ' ')} for this event`,
      });
      await fetchEventData();
    } catch (error) {
      console.error('Error updating attendance:', error);
      toast({ title: 'Error', description: 'Failed to update attendance', variant: 'destructive' });
    }
  };

  const handleExportToCalendar = async () => {
    if (!event) return;
    try {
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
      toast({
        title: 'Calendar export successful',
        description: 'Event has been exported to your calendar',
      });
    } catch (error) {
      console.error('Error exporting calendar:', error);
      toast({
        title: 'Export failed',
        description: 'Failed to export event to calendar',
        variant: 'destructive',
      });
    }
  };

  const handleShare = async () => {
    if (!event) return;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, url: shareUrl });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Link copied', description: 'Event link copied to clipboard' });
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box
          sx={{
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          <Box sx={{ height: 24, bgcolor: 'action.hover', borderRadius: 1, width: '40%', mb: 2 }} />
          <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 3, mb: 3 }} />
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '60%', mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            {[1, 2, 3, 4].map((i) => (
              <Box
                key={i}
                sx={{ height: 32, width: 80, bgcolor: 'action.hover', borderRadius: 4 }}
              />
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
            <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 2 }} />
            <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 2 }} />
          </Box>
        </Box>
      </Container>
    );
  }

  if (!event) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Event Not Found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The event you're looking for doesn't exist.
        </Typography>
        <Link to="/events">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Events
          </Button>
        </Link>
      </Container>
    );
  }

  const attendeesGoing = event.event_attendees?.filter((a) => a.status === 'going') || [];
  const attendeesInterested = event.event_attendees?.filter((a) => a.status === 'interested') || [];

  const formatEventDate = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
      return `${format(start, 'EEE, MMM d')} - ${format(end, 'EEE, MMM d, yyyy')}`;
    }
    return format(start, 'EEEE, MMMM d, yyyy');
  };

  const getPriceDisplay = () => {
    if (event.is_free) return 'Free';
    if (event.price_min && event.price_max) {
      return event.price_min === event.price_max
        ? `$${event.price_min}`
        : `$${event.price_min} - $${event.price_max}`;
    }
    if (event.price_min) return `From $${event.price_min}`;
    return 'Price TBA';
  };

  const heroImage = event.images && event.images.length > 0 ? event.images[0] : null;
  const cityName = event.cities?.name || event.city;
  const countryName = event.countries?.name || event.country;
  const cityLink = event.cities?.id ? `/city/${event.cities.id}` : null;
  const countryLink = event.countries?.id ? `/country/${event.countries.id}` : null;
  const locationLabel = event.venues?.name || event.venue_name || 'Location TBA';

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        <Link
          to="/events"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 4 }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ '&:hover': { color: 'primary.main' } }}
          >
            Events
          </Typography>
        </Link>
        {countryName && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
            {countryLink ? (
              <Link to={countryLink} style={{ textDecoration: 'none' }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ '&:hover': { color: 'primary.main' } }}
                >
                  {countryName}
                </Typography>
              </Link>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {countryName}
              </Typography>
            )}
          </>
        )}
        {cityName && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
            {cityLink ? (
              <Link to={cityLink} style={{ textDecoration: 'none' }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ '&:hover': { color: 'primary.main' } }}
                >
                  {cityName}
                </Typography>
              </Link>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {cityName}
              </Typography>
            )}
          </>
        )}
        <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {event.title}
        </Typography>
      </Box>

      {/* Compact Hero Image */}
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

      {/* Safety Alert Banner */}
      {event.countries?.lgbti_criminalization && (
        <SafetyAlertBanner
          criminalization={event.countries.lgbti_criminalization}
          countryName={event.countries.name}
        />
      )}

      {/* Title Row */}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
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
                  border: '1px solid',
                  borderColor: 'divider',
                  p: '3px',
                  flexShrink: 0,
                }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {event.title}
            </Typography>
            {event.featured && (
              <Badge style={{ backgroundColor: '#333333', color: '#ffffff' }}>Featured</Badge>
            )}
            {event.countries?.equality_score != null && (
              <EqualityScoreBadge score={event.countries.equality_score} size="sm" />
            )}
          </Box>
          {event.festivals?.id && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Music style={{ width: 14, height: 14, color: '#9ca3af' }} />
              <Typography variant="body2" color="text.secondary">
                Part of{' '}
                <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
                  {event.festivals.name}
                </Typography>
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <MapPin style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">
              {event.venues?.id ? (
                <Link
                  to={`/venues/${event.venues.id}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                  >
                    {event.venues.name}
                  </Typography>
                </Link>
              ) : (
                event.venue_name || ''
              )}
              {cityName && (
                <>
                  {event.venues?.name || event.venue_name ? ', ' : ''}
                  {cityLink ? (
                    <Link to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                      >
                        {cityName}
                      </Typography>
                    </Link>
                  ) : (
                    cityName
                  )}
                </>
              )}
              {countryName && (
                <>
                  {', '}
                  {countryLink ? (
                    <Link to={countryLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                      >
                        {countryName}
                      </Typography>
                    </Link>
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
          <Button variant="outline" size="sm" onClick={() => setAddToTripOpen(true)}>
            <Luggage style={{ width: 14, height: 14, marginRight: 6 }} />
            Add to Trip
          </Button>
          {tripStatus?.isInTrip && (
            <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
              In {tripStatus.count} trip{tripStatus.count !== 1 ? 's' : ''}
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
          <Button variant="outline" size="sm" onClick={handleExportToCalendar}>
            <Download style={{ width: 16, height: 16, marginRight: 6 }} />
            Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 style={{ width: 16, height: 16, marginRight: 6 }} />
            Share
          </Button>
        </Box>
      </Box>

      {/* Stat Chips */}
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
        />
        <Chip
          icon={<DollarSign style={{ width: 14, height: 14 }} />}
          label={getPriceDisplay()}
          size="small"
          variant="outlined"
        />
        {event.event_type && (
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

      {/* 2-Column Layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
        {/* Main Content */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Description */}
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

          {/* Attendance Actions */}
          {user && (
            <Card>
              <CardContent style={{ paddingTop: 24 }}>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <Button
                    variant={userAttendance === 'going' ? 'default' : 'outline'}
                    onClick={() => handleAttendanceUpdate('going')}
                    style={{ flex: 1 }}
                  >
                    <Users style={{ width: 16, height: 16, marginRight: 8 }} />
                    Going {userAttendance === 'going' && '\u2713'}
                  </Button>
                  <Button
                    variant={userAttendance === 'interested' ? 'default' : 'outline'}
                    onClick={() => handleAttendanceUpdate('interested')}
                    style={{ flex: 1 }}
                  >
                    <Users style={{ width: 16, height: 16, marginRight: 8 }} />
                    Interested {userAttendance === 'interested' && '\u2713'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Attendees */}
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

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Location Map */}
          {(() => {
            const lat = event.latitude ?? event.venues?.latitude;
            const lng = event.longitude ?? event.venues?.longitude;
            return typeof lat === 'number' && typeof lng === 'number' ? (
              <Card>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
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
            ) : null;
          })()}

          {/* Event Details */}
          <Card>
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Calendar style={{ width: 16, height: 16, color: '#999999' }} />
                <Typography variant="body2">
                  {formatEventDate(event.start_date, event.end_date)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Clock style={{ width: 16, height: 16, color: '#999999' }} />
                <Typography variant="body2">
                  {formatEventTime(event.start_date, event.end_date)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <DollarSign style={{ width: 16, height: 16, color: '#999999' }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {getPriceDisplay()}
                </Typography>
              </Box>
              {event.max_attendees && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Users style={{ width: 16, height: 16, color: '#999999' }} />
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
                    onClick={() =>
                      navigate(`/events?organizer=${encodeURIComponent(event.organizer_name!)}`)
                    }
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

          {/* Links */}
          {(event.website || event.ticket_url) && (
            <Card>
              <CardHeader>
                <CardTitle>Links</CardTitle>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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

          {/* Venue Card */}
          {event.venues && (
            <Card>
              <CardHeader>
                <CardTitle>Venue</CardTitle>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {event.venues.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {event.venues.address}
                  <br />
                  {event.venues.city}
                  {event.venues.state ? `, ${event.venues.state}` : ''} {event.venues.country}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  {event.venues.phone && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${event.venues.phone}`}>
                        <Phone style={{ width: 14, height: 14, marginRight: 6 }} />
                        Call
                      </a>
                    </Button>
                  )}
                  <Link to={`/venues/${event.venues.id}`}>
                    <Button variant="outline" size="sm">
                      View Venue
                    </Button>
                  </Link>
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      </Box>

      <AddToTripDialog
        open={addToTripOpen}
        onClose={() => setAddToTripOpen(false)}
        entity={{
          type: 'event',
          id: event.id,
          name: event.title,
          latitude: event.latitude,
          longitude: event.longitude,
          city_id: event.city_id,
          country_id: event.country_id,
          category: event.event_type,
        }}
      />
    </Container>
  );
}
