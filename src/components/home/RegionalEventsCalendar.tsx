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
  const { events, loading, fetchEvents, updateAttendance } = useEvents();
  const isMobile = useIsMobile();
  const { location: userLocation, loading: locationLoading } = useVisitorLocation();
  const navigate = useLocalizedNavigate();

  // Fetch upcoming events for the user's city when location is available
  useEffect(() => {
    if (userLocation?.city) {
      const now = new Date();
      const end = new Date();
      end.setDate(now.getDate() + 30);
      fetchEvents({
        city: userLocation.city,
        dateRange: { start: now.toISOString(), end: end.toISOString() },
      });
    }
  }, [userLocation?.city, fetchEvents]);

  if (locationLoading || loading) {
    return null;
  }

  // Only render if we have a city and at least one upcoming event in that region
  if (!userLocation?.city) {
    return null;
  }
  if (events.length === 0) {
    return null;
  }

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
                Upcoming Events Near You
              </Typography>
            </Box>
            <Typography variant={isMobile ? 'caption' : 'body1'} color="text.secondary">
              Calendar for {userLocation?.city || userLocation?.region || 'your region'}
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
