import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Clock, Loader2 } from 'lucide-react';
import { useUserEvents } from '@/hooks/useUserEvents';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function UserEventsSection() {
  const { attendances, loading, error } = useUserEvents();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <Loader2 style={{ height: 32, width: 32, animation: 'spin 1s linear infinite' }} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" sx={{ color: 'error.main' }}>Error loading events: {error}</Typography>
        </CardContent>
      </Card>
    );
  }

  const formatEventDate = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;

    const startFormatted = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    if (end && end.toDateString() !== start.toDateString()) {
      const endFormatted = end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      return `${startFormatted} - ${endFormatted}`;
    }

    return startFormatted;
  };

  const formatEventTime = (startDate: string) => {
    return new Date(startDate).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'going':
        return 'default';
      case 'interested':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Events</CardTitle>
      </CardHeader>
      <CardContent>
        {attendances.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              You haven't shown interest in any events yet.
            </Typography>
            <Button onClick={() => navigate('/events')}>
              Browse Events
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {attendances.map((attendance) => (
              <Box
                key={attendance.id}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => navigate(`/events/${attendance.event.id}`)}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, '&:hover': { color: 'primary.main' }, transition: 'color 0.2s' }}>
                    {attendance.event.title}
                  </Typography>
                  <Badge variant={getStatusBadgeVariant(attendance.status)}>
                    {attendance.status === 'going' ? 'Going' : 'Interested'}
                  </Badge>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Calendar style={{ height: 16, width: 16 }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{formatEventDate(attendance.event.start_date, attendance.event.end_date)}</Typography>
                    <Clock style={{ height: 16, width: 16, marginLeft: 8 }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{formatEventTime(attendance.event.start_date)}</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MapPin style={{ height: 16, width: 16 }} />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {attendance.event.venue_name && `${attendance.event.venue_name}, `}
                      {attendance.event.city}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                      {attendance.event.event_type}
                    </Badge>
                    {attendance.event.featured && (
                      <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                        Featured
                      </Badge>
                    )}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
