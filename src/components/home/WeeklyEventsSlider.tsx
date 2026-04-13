import React, { useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEvents } from '@/hooks/useEvents';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Calendar, MapPin, Clock, ArrowRight, Navigation } from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Link } from 'react-router';
import { formatEventTime } from '@/lib/event-time';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';

const WeeklyEventsSlider = React.memo(() => {
  const { events, loading, fetchEvents } = useEvents();
  const isMobile = useIsMobile();
  const { location: userLocation, loading: locationLoading } = useVisitorLocation();

  // Fetch events when location is available
  useEffect(() => {
    if (userLocation) {
      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = endOfWeek(now);
      fetchEvents({
        dateRange: {
          start: weekStart.toISOString(),
          end: weekEnd.toISOString(),
        },
        nearMe: {
          lat: userLocation.latitude,
          lng: userLocation.longitude,
        },
      });
    }
  }, [userLocation, fetchEvents]);

  // Filter and sort events by distance and date
  const weeklyEvents = useMemo(
    () =>
      events
        .filter((event) => {
          const eventDate = new Date(event.start_date);
          const now = new Date();
          const weekStart = startOfWeek(now);
          const weekEnd = endOfWeek(now);
          return eventDate >= weekStart && eventDate <= weekEnd;
        })
        .slice(0, 10),
    [events],
  ); // Limit to 10 events

  if (locationLoading || loading) {
    return null;
  }
  if (!userLocation || weeklyEvents.length === 0) {
    return null;
  }
  return (
    <section
      style={{
        backgroundColor: 'rgba(var(--muted-rgb), 0.1)',
        padding: isMobile ? '32px 16px' : '64px 16px',
      }}
    >
      <Box sx={{ mx: 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: isMobile ? 24 : 32,
          }}
        >
          <div>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Navigation
                style={{
                  height: isMobile ? 20 : 24,
                  width: isMobile ? 20 : 24,
                  color: 'hsl(var(--primary))',
                }}
              />
              <h2 style={{ fontWeight: 700, fontSize: isMobile ? '1.25rem' : '1.875rem' }}>
                This Week Near You
              </h2>
            </Box>
            <p
              style={{
                color: 'var(--muted-foreground)',
                fontSize: isMobile ? '0.875rem' : '1.125rem',
              }}
            >
              Events happening in {userLocation.city || 'your area'} this week
            </p>
          </div>
          <Button variant="outline" size={isMobile ? 'sm' : 'default'} asChild>
            <Link to="/events">
              View All
              <ArrowRight
                style={{ marginLeft: 8, height: isMobile ? 12 : 16, width: isMobile ? 12 : 16 }}
              />
            </Link>
          </Button>
        </div>

        <Carousel
          opts={{
            align: 'start',
            loop: false,
          }}
          style={{ width: '100%' }}
        >
          <CarouselContent style={{ marginLeft: isMobile ? -8 : -16 }}>
            {weeklyEvents.map((event) => (
              <CarouselItem
                key={event.id}
                style={{
                  paddingLeft: isMobile ? 8 : 16,
                  flex: isMobile ? '0 0 100%' : '0 0 33.333%',
                }}
              >
                <Card style={{ transition: 'all 0.3s', height: '100%' }}>
                  <CardContent
                    style={{
                      padding: 24,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        mb: 2,
                      }}
                    >
                      <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                        {event.event_type}
                      </Badge>
                      {event.is_free ? (
                        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                          Free
                        </Badge>
                      ) : (
                        event.price_min && (
                          <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                            ${event.price_min}+
                          </Badge>
                        )
                      )}
                    </Box>

                    <h3
                      style={{
                        fontWeight: 600,
                        marginBottom: 12,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        transition: 'color 0.2s',
                        fontSize: isMobile ? '1rem' : '1.125rem',
                      }}
                    >
                      {event.title}
                    </h3>

                    <Box
                      sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2, flexGrow: 1 }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          color: 'text.secondary',
                        }}
                      >
                        <Calendar style={{ height: 16, width: 16, flexShrink: 0 }} />
                        <Box component="span" sx={{ fontSize: '0.875rem' }}>
                          {format(new Date(event.start_date), 'EEE, MMM d')}
                        </Box>
                      </Box>

                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          color: 'text.secondary',
                        }}
                      >
                        <Clock style={{ height: 16, width: 16, flexShrink: 0 }} />
                        <Box component="span" sx={{ fontSize: '0.875rem' }}>
                          {formatEventTime(event.start_date, event.end_date)}
                        </Box>
                      </Box>

                      {(event.city || event.venue_name) && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            color: 'text.secondary',
                          }}
                        >
                          <MapPin style={{ height: 16, width: 16, flexShrink: 0 }} />
                          <Box
                            component="span"
                            sx={{
                              fontSize: '0.875rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {event.venue_name || event.city}
                          </Box>
                        </Box>
                      )}
                    </Box>

                    {event.description && (
                      <Typography
                        sx={{
                          fontSize: '0.875rem',
                          color: 'text.secondary',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mb: 2,
                        }}
                      >
                        {event.description}
                      </Typography>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
                      asChild
                    >
                      <Link to={`/events/${event.slug}`}>
                        Learn More
                        <ArrowRight style={{ marginLeft: 8, height: 12, width: 12 }} />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>

          {!isMobile && weeklyEvents.length > 3 && (
            <>
              <CarouselPrevious style={{ display: 'flex' }} />
              <CarouselNext style={{ display: 'flex' }} />
            </>
          )}
        </Carousel>

        {isMobile && weeklyEvents.length > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {weeklyEvents.slice(0, 5).map((_, index) => (
                <Box
                  key={index}
                  sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.hover' }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </section>
  );
});
WeeklyEventsSlider.displayName = 'WeeklyEventsSlider';

export default WeeklyEventsSlider;
