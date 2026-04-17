import React, { useEffect } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { EventsCalendarView } from '@/components/events/EventsCalendarView';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Navigation } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';

const RegionalEventsCalendar: React.FC = () => {
  const { events, loading, fetchEvents, updateAttendance } = useEvents(false);
  const isMobile = useIsMobile();
  const { location: userLocation, loading: locationLoading } = useVisitorLocation();
  const navigate = useLocalizedNavigate();

  // Fetch next-30d upcoming events. Prefer visitor's city when available,
  // else show global upcoming list. fetchEvents is intentionally omitted
  // from deps: it's recreated on every hook render, so including it loops.
  const city = userLocation?.city;
  useEffect(() => {
    if (locationLoading) return;
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30);
    const range = { start: now.toISOString(), end: end.toISOString() };
    if (city) {
      fetchEvents({ city, dateRange: range }).then((res) => {
        if (res.fetched === 0) fetchEvents({ dateRange: range });
      });
    } else {
      fetchEvents({ dateRange: range });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, locationLoading]);

  if (loading) return null;
  if (events.length === 0) return null;

  return (
    <Box component="section" sx={{ bgcolor: 'action.hover', py: isMobile ? 3 : 6, px: 2 }}>
      <Container>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: isMobile ? 2 : 3,
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Navigation
                style={{ width: isMobile ? 20 : 24, height: isMobile ? 20 : 24 }}
                color="var(--mui-palette-primary-main)"
              />
              <Typography variant={isMobile ? 'subtitle1' : 'h5'} sx={{ fontWeight: 700 }}>
                {userLocation?.city ? 'Upcoming Events Near You' : 'Upcoming Events'}
              </Typography>
            </Box>
            <Typography variant={isMobile ? 'caption' : 'body1'} color="text.secondary">
              {userLocation?.city || userLocation?.region
                ? `Calendar for ${userLocation.city || userLocation.region}`
                : 'Next 30 days'}
            </Typography>
          </Box>
          <Button
            variant="outline"
            size={isMobile ? 'sm' : 'default'}
            onClick={() => navigate('/events')}
          >
            Browse All
          </Button>
        </Box>

        <EventsCalendarView
          events={events}
          onEventSelect={(event) => navigate(`/events/${event.slug}`)}
          onAttendanceUpdate={updateAttendance}
        />
      </Container>
    </Box>
  );
};

export default RegionalEventsCalendar;
