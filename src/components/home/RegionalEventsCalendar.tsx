import React, { useEffect, useState } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { EventsCalendarView } from '@/components/events/EventsCalendarView';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

interface UserLocation {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
}

const RegionalEventsCalendar: React.FC = () => {
  const { events, loading, fetchEvents, updateAttendance } = useEvents();
  const isMobile = useIsMobile();
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const navigate = useNavigate();

  // Get user location from IP address
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.latitude && data.longitude) {
          setUserLocation({
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city,
            region: data.region
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
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: isMobile ? 2 : 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Navigation style={{ width: isMobile ? 20 : 24, height: isMobile ? 20 : 24 }} color="var(--mui-palette-primary-main)" />
              <Typography variant={isMobile ? 'subtitle1' : 'h5'} sx={{ fontWeight: 700 }}>
                Upcoming Events Near You
              </Typography>
            </Box>
            <Typography variant={isMobile ? 'caption' : 'body1'} color="text.secondary">
              Calendar for {userLocation?.city || userLocation?.region || 'your region'}
            </Typography>
          </Box>
          <Button variant="outline" size={isMobile ? 'sm' : 'default'} onClick={() => navigate('/events')}>
            Browse All
          </Button>
        </Box>

        <EventsCalendarView
          events={events}
          onEventSelect={(event) => navigate(`/events/${event.id}`)}
          onAttendanceUpdate={updateAttendance}
        />
      </Container>
    </Box>
  );
};

export default RegionalEventsCalendar;
