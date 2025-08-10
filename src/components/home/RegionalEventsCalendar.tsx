import React, { useEffect, useState } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { EventsCalendarView } from '@/components/events/EventsCalendarView';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

  if (locationLoading && loading) {
    return null;
  }

  return (
    <section className={`bg-muted/10 ${isMobile ? 'py-6' : 'py-12'} px-4`}>
      <div className="container mx-auto">
        <div className={`flex items-center justify-between ${isMobile ? 'mb-4' : 'mb-6'}`}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Navigation className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6'} text-primary`} />
              <h2 className={`font-bold ${isMobile ? 'text-lg' : 'text-2xl'}`}>
                Upcoming Events Near You
              </h2>
            </div>
            <p className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-base'}`}>
              Calendar for {userLocation?.city || userLocation?.region || 'your region'}
            </p>
          </div>
          <Button variant="outline" size={isMobile ? 'sm' : 'default'} onClick={() => navigate('/events')}>
            Browse All
          </Button>
        </div>

        <EventsCalendarView
          events={events}
          onEventSelect={(event) => navigate(`/events/${event.id}`)}
          onAttendanceUpdate={updateAttendance}
        />
      </div>
    </section>
  );
};

export default RegionalEventsCalendar;
