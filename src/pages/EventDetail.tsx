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
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

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

        // Fetch event details with venue (public, works for anonymous users)
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

        // Fetch attendees with profiles separately (requires authenticated user)
        // The profiles table only allows authenticated access
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

      // Refresh event data by re-fetching
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

      // Create a blob from the calendar data and trigger download
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
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
            <div className="space-y-6">
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Event Not Found</h1>
        <p className="text-muted-foreground mb-6">The event you're looking for doesn't exist.</p>
        <Link to="/events">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Events
          </Button>
        </Link>
      </div>
    );
  }

  const attendeesGoing = event.event_attendees?.filter(a => a.status === 'going') || [];
  const attendeesInterested = event.event_attendees?.filter(a => a.status === 'interested') || [];

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      party: 'bg-primary/10 text-primary',
      workshop: 'bg-accent/10 text-accent',
      meetup: 'bg-secondary/10 text-secondary',
      pride: 'bg-primary text-primary-foreground',
      rally: 'bg-destructive/10 text-destructive',
    };
    return colors[type] || 'bg-muted/10 text-muted-foreground';
  };

  const formatEventDate = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
      return `${format(start, 'EEEE, MMMM d')} - ${format(end, 'EEEE, MMMM d, yyyy')}`;
    }
    return format(start, 'EEEE, MMMM d, yyyy');
  };

  const formatEventTime = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;

    // Detect all-day events (start at midnight UTC, end at 23:59 UTC)
    const startUTC = `${String(start.getUTCHours()).padStart(2,'0')}:${String(start.getUTCMinutes()).padStart(2,'0')}`;
    const endUTC = end ? `${String(end.getUTCHours()).padStart(2,'0')}:${String(end.getUTCMinutes()).padStart(2,'0')}` : null;
    if (startUTC === '00:00' && endUTC === '23:59') return 'All Day';

    if (end) {
      return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
    }
    return format(start, 'h:mm a');
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <Link to="/events" className="inline-flex items-center text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Events
        </Link>
        
        {/* Hero Section */}
        {event.images && event.images.length > 0 && (
          <div className="relative mb-8">
            <div className="aspect-[21/9] rounded-2xl overflow-hidden bg-gradient-to-r from-primary/20 to-accent/20">
              <img
                src={event.images[0]}
                alt={event.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-start gap-4 mb-4">
              <div>
                <h1 className="text-4xl font-bold mb-2">{event.title}</h1>
                <div className="flex items-center gap-3 mb-4">
                  <Badge className={getEventTypeColor(event.event_type)} variant="secondary">
                    {event.event_type}
                  </Badge>
                  <Badge variant="outline" className={`${event.is_free ? 'border-success text-success' : 'border-primary text-primary'} font-medium`}>
                    {getPriceDisplay()}
                  </Badge>
                  {event.featured && (
                    <Badge className="bg-gradient-to-r from-primary to-accent text-primary-foreground">✨ Featured</Badge>
                  )}
                  {event.age_restriction && (
                    <Badge variant="outline">
                      {event.age_restriction}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3 p-4 bg-muted/50">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{formatEventDate(event.start_date, event.end_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-medium">{formatEventTime(event.start_date, event.end_date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-muted/50">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  {event.venues?.id ? (
                    <Link 
                      to={`/venues/${event.venues.id}`} 
                      className="font-medium text-primary hover:underline"
                    >
                      {event.venues.name}
                    </Link>
                  ) : (
                    <p className="font-medium">{event.venue_name || 'Location TBA'}</p>
                  )}
                   <p className="text-sm text-muted-foreground">
                     <Link 
                       to={`/cities/${event.city?.toLowerCase().replace(/\s+/g, '-')}`} 
                       className="text-primary hover:underline"
                     >
                       {event.city}
                     </Link>
                     {event.state && `, ${event.state}`}
                   </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[200px]">
            {event.ticket_url && (
              <Button size="lg" className="w-full" asChild>
                <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Get Tickets
                </a>
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportToCalendar} className="flex-1">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Attendance Actions */}
          {user && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <Button 
                    variant={userAttendance === 'going' ? 'default' : 'outline'}
                    onClick={() => handleAttendanceUpdate('going')}
                    className="flex-1"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Going {userAttendance === 'going' && '✓'}
                  </Button>
                  <Button 
                    variant={userAttendance === 'interested' ? 'default' : 'outline'}
                    onClick={() => handleAttendanceUpdate('interested')}
                    className="flex-1"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Interested {userAttendance === 'interested' && '✓'}
                  </Button>
                </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {event.images.map((imageUrl, index) => (
                    <div key={index} className="aspect-video rounded-lg overflow-hidden bg-muted">
                      <img
                        src={imageUrl}
                        alt={`${event.title} - Image ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/placeholder.svg';
                        }}
                        onClick={() => {
                          // Open image in new tab for full view
                          window.open(imageUrl, '_blank');
                        }}
                      />
                    </div>
                  ))}
                </div>
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
                <p className="text-muted-foreground whitespace-pre-wrap">{event.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Venue Information */}
          {event.venues && (
            <Card>
              <CardHeader>
                <CardTitle>Venue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">{event.venues.name}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {event.venues.address}<br />
                    {event.venues.city}, {event.venues.state} {event.venues.country}
                  </p>
                </div>
                
                <div className="flex gap-3">
                  {event.venues.phone && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${event.venues.phone}`}>
                        <Phone className="h-4 w-4 mr-2" />
                        Call
                      </a>
                    </Button>
                  )}
                  {event.venues.website && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={event.venues.website} target="_blank" rel="noopener noreferrer">
                        <Globe className="h-4 w-4 mr-2" />
                        Website
                      </a>
                    </Button>
                  )}
                  <Link to={`/venues/${event.venues.id}`}>
                    <Button variant="outline" size="sm">
                      View Venue Details
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attendees - Only shown to logged in users */}
          {user && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Attendees ({attendeesGoing.length} going, {attendeesInterested.length} interested)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attendeesGoing.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium mb-2 text-sm">Going</h4>
                    <div className="flex flex-wrap gap-2">
                      {attendeesGoing.slice(0, 12).map((attendee) => (
                        <div key={attendee.id} className="flex items-center gap-2 bg-muted/30 rounded-full px-3 py-1">
                          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground">
                            {attendee.profiles?.display_name?.[0] || 'U'}
                          </div>
                          <span className="text-xs">{attendee.profiles?.display_name || 'Anonymous'}</span>
                        </div>
                      ))}
                      {attendeesGoing.length > 12 && (
                        <div className="text-xs text-muted-foreground px-3 py-1">
                          +{attendeesGoing.length - 12} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {attendeesInterested.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 text-sm">Interested</h4>
                    <div className="flex flex-wrap gap-2">
                      {attendeesInterested.slice(0, 8).map((attendee) => (
                        <div key={attendee.id} className="flex items-center gap-2 bg-muted/20 rounded-full px-3 py-1">
                          <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center text-xs">
                            {attendee.profiles?.display_name?.[0] || 'U'}
                          </div>
                          <span className="text-xs">{attendee.profiles?.display_name || 'Anonymous'}</span>
                        </div>
                      ))}
                      {attendeesInterested.length > 8 && (
                        <div className="text-xs text-muted-foreground px-3 py-1">
                          +{attendeesInterested.length - 8} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {attendeesGoing.length === 0 && attendeesInterested.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No attendees yet. Be the first!</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Event Details */}
          <Card>
            <CardHeader>
              <CardTitle>Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{getPriceDisplay()}</span>
              </div>
              
              {event.max_attendees && (
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Max {event.max_attendees} attendees</span>
                </div>
              )}

              {event.organizer_name && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Organizer</h4>
                  <button 
                    onClick={() => navigate(`/events?organizer=${encodeURIComponent(event.organizer_name!)}`)}
                    className="text-sm text-primary hover:underline text-left"
                  >
                    {event.organizer_name}
                  </button>
                  {event.organizer_contact && (
                    <p className="text-xs text-muted-foreground">{event.organizer_contact}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tags - will be implemented with unified tag system */}

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle>Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {event.website && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={event.website} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-4 w-4 mr-2" />
                    Event Website
                  </a>
                </Button>
              )}
              
              {event.ticket_url && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Get Tickets
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}