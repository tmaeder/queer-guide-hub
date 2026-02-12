import React, { useEffect, useState, useMemo } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Calendar, MapPin, Clock, ArrowRight, Navigation } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { Link } from 'react-router-dom';
import { formatEventTime } from '@/lib/event-time';
interface UserLocation {
  latitude: number;
  longitude: number;
  city?: string;
}
const WeeklyEventsSlider = React.memo(() => {
  const {
    events,
    loading,
    fetchEvents
  } = useEvents();
  const isMobile = useIsMobile();
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // Get user location from IP address
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        // Use a free IP geolocation service
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.latitude && data.longitude) {
          setUserLocation({
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city
          });
        }
      } catch (error) {
        console.error('Failed to get user location:', error);
      } finally {
        setLocationLoading(false);
      }
    };
    getUserLocation();
  }, []);

  // Fetch events when location is available
  useEffect(() => {
    if (userLocation) {
      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = endOfWeek(now);
      fetchEvents({
        dateRange: {
          start: weekStart.toISOString(),
          end: weekEnd.toISOString()
        },
        nearMe: {
          lat: userLocation.latitude,
          lng: userLocation.longitude
        }
      });
    }
  }, [userLocation, fetchEvents]);

  // Filter and sort events by distance and date
  const weeklyEvents = useMemo(() => events.filter(event => {
    const eventDate = new Date(event.start_date);
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);
    return eventDate >= weekStart && eventDate <= weekEnd;
  }).slice(0, 10), [events]); // Limit to 10 events

  if (locationLoading || loading) {
    return;
  }
  if (!userLocation || weeklyEvents.length === 0) {
    return null;
  }
  return <section style={{ backgroundColor: 'rgba(var(--muted-rgb), 0.1)', padding: isMobile ? '32px 16px' : '64px 16px' }}>
      <div sx={{ maxWidth: 'lg', mx: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 24 : 32 }}>
          <div>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Navigation style={{ height: isMobile ? 20 : 24, width: isMobile ? 20 : 24, color: 'hsl(var(--primary))' }} />
              <h2 style={{ fontWeight: 700, fontSize: isMobile ? '1.25rem' : '1.875rem' }}>
                This Week Near You
              </h2>
            </div>
            <p style={{ color: 'var(--muted-foreground)', fontSize: isMobile ? '0.875rem' : '1.125rem' }}>
              Events happening in {userLocation.city || 'your area'} this week
            </p>
          </div>
          <Button variant="outline" size={isMobile ? "sm" : "default"} asChild>
            <Link to="/events">
              View All
              <ArrowRight style={{ marginLeft: 8, height: isMobile ? 12 : 16, width: isMobile ? 12 : 16 }} />
            </Link>
          </Button>
        </div>

        <Carousel opts={{
        align: "start",
        loop: false
      }} sx={{ width: '100%' }}>
          <CarouselContent sx={{ ml: { xs: -1, md: -2 } }}>
            {weeklyEvents.map(event => <CarouselItem key={event.id} style={{ paddingLeft: isMobile ? 8 : 16, flex: isMobile ? '0 0 100%' : '0 0 33.333%' }}>
                <Card sx={{ transition: 'all 0.3s', height: '100%', '&:hover': { boxShadow: 6, transform: 'translateY(-4px)' } }}>
                  <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                      <Badge variant="secondary" sx={{ fontSize: '0.75rem' }}>
                        {event.event_type}
                      </Badge>
                      {event.is_free ? <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                          Free
                        </Badge> : event.price_min && <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                          ${event.price_min}+
                        </Badge>}
                    </div>
                    
                    <h3 style={{ fontWeight: 600, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', transition: 'color 0.2s', fontSize: isMobile ? '1rem' : '1.125rem' }}>
                      {event.title}
                    </h3>
                    
                    <div sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2, flexGrow: 1 }}>
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                        <Calendar style={{ height: 16, width: 16, flexShrink: 0 }} />
                        <span sx={{ fontSize: '0.875rem' }}>
                          {format(new Date(event.start_date), 'EEE, MMM d')}
                        </span>
                      </div>
                      
                      <div sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                        <Clock style={{ height: 16, width: 16, flexShrink: 0 }} />
                        <span sx={{ fontSize: '0.875rem' }}>
                          {formatEventTime(event.start_date, event.end_date)}
                        </span>
                      </div>
                      
                      {(event.city || event.venue_name) && <div sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                          <MapPin style={{ height: 16, width: 16, flexShrink: 0 }} />
                          <span sx={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {event.venue_name || event.city}
                          </span>
                        </div>}
                    </div>

                    {event.description && <p sx={{ fontSize: '0.875rem', color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mb: 2 }}>
                        {event.description}
                      </p>}

                    <Button variant="ghost" size="sm" sx={{ mt: 'auto', alignSelf: 'flex-start' }} asChild>
                      <Link to={`/events/${event.id}`}>
                        Learn More
                        <ArrowRight style={{ marginLeft: 8, height: 12, width: 12 }} />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </CarouselItem>)}
          </CarouselContent>
          
          {!isMobile && weeklyEvents.length > 3 && <>
              <CarouselPrevious sx={{ display: { xs: 'none', md: 'flex' } }} />
              <CarouselNext sx={{ display: { xs: 'none', md: 'flex' } }} />
            </>}
        </Carousel>

        {isMobile && weeklyEvents.length > 1 && <div sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <div sx={{ display: 'flex', gap: 1 }}>
              {weeklyEvents.slice(0, 5).map((_, index) => <div key={index} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.hover' }} />)}
            </div>
          </div>}
      </div>
    </section>;
});
WeeklyEventsSlider.displayName = 'WeeklyEventsSlider';

export default WeeklyEventsSlider;