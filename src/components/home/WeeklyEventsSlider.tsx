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
  return <section className={`bg-muted/10 ${isMobile ? 'py-8' : 'py-16'} px-4`}>
      <div className="container mx-auto">
        <div className={`flex items-center justify-between ${isMobile ? 'mb-6' : 'mb-8'}`}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Navigation className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'} text-primary`} />
              <h2 className={`font-bold ${isMobile ? 'text-xl' : 'text-3xl'}`}>
                This Week Near You
              </h2>
            </div>
            <p className={`text-muted-foreground ${isMobile ? 'text-sm' : 'text-lg'}`}>
              Events happening in {userLocation.city || 'your area'} this week
            </p>
          </div>
          <Button variant="outline" size={isMobile ? "sm" : "default"} asChild>
            <Link to="/events">
              View All
              <ArrowRight className={`ml-2 ${isMobile ? 'h-3 w-3' : 'h-4 w-4'}`} />
            </Link>
          </Button>
        </div>

        <Carousel opts={{
        align: "start",
        loop: false
      }} className="w-full">
          <CarouselContent className="-ml-2 md:-ml-4">
            {weeklyEvents.map(event => <CarouselItem key={event.id} className={`pl-2 md:pl-4 ${isMobile ? 'basis-full' : 'basis-full md:basis-1/2 lg:basis-1/3'}`}>
                <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
                  <CardContent className="p-6 h-full flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <Badge variant="secondary" className="text-xs">
                        {event.event_type}
                      </Badge>
                      {event.is_free ? <Badge variant="outline" className="text-xs">
                          Free
                        </Badge> : event.price_min && <Badge variant="outline" className="text-xs">
                          ${event.price_min}+
                        </Badge>}
                    </div>
                    
                    <h3 className={`font-semibold mb-3 line-clamp-2 group-hover:text-primary transition-colors ${isMobile ? 'text-base' : 'text-lg'}`}>
                      {event.title}
                    </h3>
                    
                    <div className="space-y-2 mb-4 flex-grow">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm">
                          {format(new Date(event.start_date), 'EEE, MMM d')}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm">
                          {formatEventTime(event.start_date, event.end_date)}
                        </span>
                      </div>
                      
                      {(event.city || event.venue_name) && <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4 flex-shrink-0" />
                          <span className="text-sm truncate">
                            {event.venue_name || event.city}
                          </span>
                        </div>}
                    </div>

                    {event.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {event.description}
                      </p>}

                    <Button variant="ghost" size="sm" className="mt-auto self-start group-hover:bg-muted/50" asChild>
                      <Link to={`/events/${event.id}`}>
                        Learn More
                        <ArrowRight className="ml-2 h-3 w-3" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </CarouselItem>)}
          </CarouselContent>
          
          {!isMobile && weeklyEvents.length > 3 && <>
              <CarouselPrevious className="hidden md:flex" />
              <CarouselNext className="hidden md:flex" />
            </>}
        </Carousel>

        {isMobile && weeklyEvents.length > 1 && <div className="flex justify-center mt-4">
            <div className="flex space-x-2">
              {weeklyEvents.slice(0, 5).map((_, index) => <div key={index} className="w-2 h-2 rounded-full bg-muted" />)}
            </div>
          </div>}
      </div>
    </section>;
});
WeeklyEventsSlider.displayName = 'WeeklyEventsSlider';

export default WeeklyEventsSlider;