import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Clock, Loader2 } from 'lucide-react';
import { useUserEvents } from '@/hooks/useUserEvents';
import { useNavigate } from 'react-router-dom';

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
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
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
          <p className="text-destructive">Error loading events: {error}</p>
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
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              You haven't shown interest in any events yet.
            </p>
            <Button onClick={() => navigate('/events')}>
              Browse Events
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {attendances.map((attendance) => (
              <div
                key={attendance.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/events/${attendance.event.id}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg hover:text-primary transition-colors">
                    {attendance.event.title}
                  </h3>
                  <Badge variant={getStatusBadgeVariant(attendance.status)}>
                    {attendance.status === 'going' ? 'Going' : 'Interested'}
                  </Badge>
                </div>
                
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{formatEventDate(attendance.event.start_date, attendance.event.end_date)}</span>
                    <Clock className="h-4 w-4 ml-2" />
                    <span>{formatEventTime(attendance.event.start_date)}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {attendance.event.venue_name && `${attendance.event.venue_name}, `}
                      {attendance.event.city}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {attendance.event.event_type}
                    </Badge>
                    {attendance.event.featured && (
                      <Badge variant="secondary" className="text-xs">
                        Featured
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}