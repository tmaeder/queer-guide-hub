import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, MapPin, Users, Clock, DollarSign, ExternalLink, Mail, Phone, Globe, Share2, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEvents } from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import { Database } from '@/integrations/supabase/types';
import { formatEventTime } from '@/lib/event-time';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [userAttendance, setUserAttendance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchEvent = async () => {
      try {
        setLoading(true);

        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select(`
            *,
            venues (
              id,
              name,
              address,
              city,
              state,
              country,
              phone,
              website,
              email
            )
          `)
          .eq('id', id)
          .single();

        if (eventError) throw eventError;

        if (user) {
          const { data: attendeesData } = await supabase
            .from('event_attendees')
            .select(`
              id,
              status,
              user_id,
              profiles:user_id (
                display_name,
                avatar_url
              )
            `)
            .eq('event_id', id);

          const fullEvent = { ...eventData, event_attendees: attendeesData || [] };
          setEvent(fullEvent);

          const userAttendee = attendeesData?.find(
            (attendee: any) => attendee.user_id === user.id
          );
          setUserAttendance(userAttendee?.status || null);
        } else {
          setEvent({ ...eventData, event_attendees: [] });
        }

      } catch (error) {
        console.error('Error fetching event:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [id, user]);

  const handleAttendanceUpdate = async (status: 'going' | 'interested' | 'not_going') => {
    if (!user || !event) {
      toast({
        title: "Authentication required",
        description: "Please sign in to update your attendance",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('event_attendees')
        .upsert({
          event_id: event.id,
          user_id: user.id,
          status
        });

      if (error) throw error;

      setUserAttendance(status);
      toast({
        title: "Attendance updated",
        description: `You're now marked as ${status.replace('_', ' ')} for this event`,
      });

      if (id) {
        try {
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select(`
              *,
              venues (
                id,
                name,
                address,
                city,
                state,
                country,
                phone,
                website,
                email
              )
            `)
            .eq('id', id)
            .single();

          if (eventError) throw eventError;

          const { data: attendeesData } = await supabase
            .from('event_attendees')
            .select(`
              id,
              status,
              user_id,
              profiles:user_id (
                display_name,
                avatar_url
              )
            `)
            .eq('event_id', id);

          setEvent({ ...eventData, event_attendees: attendeesData || [] });
        } catch (error) {
          console.error('Error refreshing event:', error);
        }
      }
    } catch (error) {
      console.error('Error updating attendance:', error);
      toast({
        title: "Error",
        description: "Failed to update attendance",
        variant: "destructive",
      });
    }
  };

  const handleExportToCalendar = async () => {
    if (!event) return;

    try {
      const { data, error } = await supabase.functions.invoke('calendar-export', {
        body: { eventId: event.id }
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
        title: "Calendar export successful",
        description: "Event has been exported to your calendar",
      });
    } catch (error) {
      console.error('Error exporting calendar:', error);
      toast({
        title: "Export failed",
        description: "Failed to export event to calendar",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '33%', mb: 3 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 1 }} />
              <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 1 }} />
            </Box>
          </Box>
        </Box>
      </Container>
    );
  }

  if (!event) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Event Not Found</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>The event you're looking for doesn't exist.</Typography>
        <Link to="/events">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Events
          </Button>
        </Link>
      </Container>
    );
  }

  const attendeesGoing = event.event_attendees?.filter(a => a.status === 'going') || [];
  const attendeesInterested = event.event_attendees?.filter(a => a.status === 'interested') || [];

  const getEventTypeSx = (type: string) => {
    const colors: Record<string, object> = {
      party: { bgcolor: 'rgba(var(--primary-rgb), 0.1)', color: 'primary.main' },
      workshop: { bgcolor: 'rgba(var(--accent-rgb), 0.1)', color: 'secondary.main' },
      meetup: { bgcolor: 'rgba(var(--secondary-rgb), 0.1)', color: 'text.secondary' },
      pride: { bgcolor: 'primary.main', color: 'primary.contrastText' },
      rally: { bgcolor: 'rgba(var(--destructive-rgb), 0.1)', color: 'error.main' },
    };
    return colors[type] || { bgcolor: 'action.hover', color: 'text.secondary' };
  };

  const formatEventDate = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;

    if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
      return `${format(start, 'EEEE, MMMM d')} - ${format(end, 'EEEE, MMMM d, yyyy')}`;
    }
    return format(start, 'EEEE, MMMM d, yyyy');
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Link to="/events" style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit', textDecoration: 'none', marginBottom: 24 }}>
          <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
          <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>Back to Events</Typography>
        </Link>

        {/* Hero Section */}
        {event.images && event.images.length > 0 && (
          <Box sx={{ position: 'relative', mb: 4 }}>
            <Box sx={{ aspectRatio: '21/9', borderRadius: 4, overflow: 'hidden', background: 'linear-gradient(to right, var(--primary-alpha-20, rgba(0,0,0,0.05)), var(--accent-alpha-20, rgba(0,0,0,0.05)))' }}>
              <Box
                component="img"
                src={event.images[0]}
                alt={event.title}
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </Box>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, alignItems: { lg: 'flex-start' }, justifyContent: { lg: 'space-between' }, gap: 3 }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>{event.title}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Badge sx={getEventTypeSx(event.event_type)} variant="secondary">
                    {event.event_type}
                  </Badge>
                  <Badge variant="outline" style={{ fontWeight: 500, borderColor: event.is_free ? 'var(--success)' : 'var(--primary)', color: event.is_free ? 'var(--success)' : 'var(--primary)' }}>
                    {getPriceDisplay()}
                  </Badge>
                  {event.featured && (
                    <Badge style={{ background: 'linear-gradient(to right, var(--primary), var(--accent))', color: 'var(--primary-foreground)' }}>Featured</Badge>
                  )}
                  {event.age_restriction && (
                    <Badge variant="outline">
                      {event.age_restriction}
                    </Badge>
                  )}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: 'action.hover' }}>
                <Calendar style={{ width: 20, height: 20, color: 'var(--primary)' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">Date</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatEventDate(event.start_date, event.end_date)}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: 'action.hover' }}>
                <Clock style={{ width: 20, height: 20, color: 'var(--primary)' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">Time</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatEventTime(event.start_date, event.end_date)}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: 'action.hover' }}>
                <MapPin style={{ width: 20, height: 20, color: 'var(--primary)' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">Location</Typography>
                  {event.venues?.id ? (
                    <Link
                      to={`/venues/${event.venues.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <Typography variant="body2" color="primary" sx={{ fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
                        {event.venues.name}
                      </Typography>
                    </Link>
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{event.venue_name || 'Location TBA'}</Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    <Link
                      to={`/cities/${event.city?.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <Typography component="span" variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                        {event.city}
                      </Typography>
                    </Link>
                    {event.state && `, ${event.state}`}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: { lg: 200 } }}>
            {event.ticket_url && (
              <Button size="lg" style={{ width: '100%' }} asChild>
                <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                  Get Tickets
                </a>
              </Button>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outline" size="sm" onClick={handleExportToCalendar} style={{ flex: 1 }}>
                <Download style={{ width: 16, height: 16 }} />
              </Button>
              <Button variant="outline" size="sm" style={{ flex: 1 }}>
                <Share2 style={{ width: 16, height: 16 }} />
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
        {/* Main Content */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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

          {/* Event Images */}
          {event.images && event.images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Event Photos</CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                  {event.images.map((imageUrl, index) => (
                    <Box key={index} sx={{ aspectRatio: '16/9', borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover' }}>
                      <Box
                        component="img"
                        src={imageUrl}
                        alt={`${event.title} - Image ${index + 1}`}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', '&:hover': { transform: 'scale(1.05)' }, transition: 'transform 300ms', cursor: 'pointer' }}
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/placeholder.svg';
                        }}
                        onClick={() => {
                          window.open(imageUrl, '_blank');
                        }}
                      />
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          {event.description && (
            <Card>
              <CardHeader>
                <CardTitle>About This Event</CardTitle>
              </CardHeader>
              <CardContent>
                <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{event.description}</Typography>
              </CardContent>
            </Card>
          )}

          {/* Venue Information */}
          {event.venues && (
            <Card>
              <CardHeader>
                <CardTitle>Venue</CardTitle>
              </CardHeader>
              <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Box>
                  <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>{event.venues.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {event.venues.address}<br />
                    {event.venues.city}, {event.venues.state} {event.venues.country}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  {event.venues.phone && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${event.venues.phone}`}>
                        <Phone style={{ width: 16, height: 16, marginRight: 8 }} />
                        Call
                      </a>
                    </Button>
                  )}
                  {event.venues.website && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={event.venues.website} target="_blank" rel="noopener noreferrer">
                        <Globe style={{ width: 16, height: 16, marginRight: 8 }} />
                        Website
                      </a>
                    </Button>
                  )}
                  <Link to={`/venues/${event.venues.id}`}>
                    <Button variant="outline" size="sm">
                      View Venue Details
                    </Button>
                  </Link>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Attendees */}
          {user && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Attendees ({attendeesGoing.length} going, {attendeesInterested.length} interested)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attendeesGoing.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Going</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {attendeesGoing.slice(0, 12).map((attendee) => (
                        <Box key={attendee.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', borderRadius: '9999px', px: 1.5, py: 0.5 }}>
                          <Box sx={{ width: 24, height: 24, bgcolor: 'primary.main', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'primary.contrastText' }}>
                            {attendee.profiles?.display_name?.[0] || 'U'}
                          </Box>
                          <Typography variant="caption">{attendee.profiles?.display_name || 'Anonymous'}</Typography>
                        </Box>
                      ))}
                      {attendeesGoing.length > 12 && (
                        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5 }}>
                          +{attendeesGoing.length - 12} more
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {attendeesInterested.length > 0 && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Interested</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {attendeesInterested.slice(0, 8).map((attendee) => (
                        <Box key={attendee.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', borderRadius: '9999px', px: 1.5, py: 0.5 }}>
                          <Box sx={{ width: 24, height: 24, bgcolor: 'action.hover', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                            {attendee.profiles?.display_name?.[0] || 'U'}
                          </Box>
                          <Typography variant="caption">{attendee.profiles?.display_name || 'Anonymous'}</Typography>
                        </Box>
                      ))}
                      {attendeesInterested.length > 8 && (
                        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.5 }}>
                          +{attendeesInterested.length - 8} more
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {attendeesGoing.length === 0 && attendeesInterested.length === 0 && (
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>No attendees yet. Be the first!</Typography>
                )}
              </CardContent>
            </Card>
          )}
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Event Details */}
          <Card>
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <DollarSign style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{getPriceDisplay()}</Typography>
              </Box>

              {event.max_attendees && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Users style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">Max {event.max_attendees} attendees</Typography>
                </Box>
              )}

              {event.organizer_name && (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>Organizer</Typography>
                  <Box
                    component="button"
                    onClick={() => navigate(`/events?organizer=${encodeURIComponent(event.organizer_name!)}`)}
                    sx={{ fontSize: 14, color: 'primary.main', '&:hover': { textDecoration: 'underline' }, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', p: 0 }}
                  >
                    {event.organizer_name}
                  </Box>
                  {event.organizer_contact && (
                    <Typography variant="caption" color="text.secondary">{event.organizer_contact}</Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle>Links</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {event.website && (
                <Button variant="outline" size="sm" style={{ width: '100%', justifyContent: 'flex-start' }} asChild>
                  <a href={event.website} target="_blank" rel="noopener noreferrer">
                    <Globe style={{ width: 16, height: 16, marginRight: 8 }} />
                    Event Website
                  </a>
                </Button>
              )}

              {event.ticket_url && (
                <Button variant="outline" size="sm" style={{ width: '100%', justifyContent: 'flex-start' }} asChild>
                  <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                    Get Tickets
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Container>
  );
}
