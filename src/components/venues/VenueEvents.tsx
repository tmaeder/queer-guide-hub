import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Users } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';

type Event = Database['public']['Tables']['events']['Row'];

interface VenueEventsProps {
  venueId: string;
  venueName: string;
  events: Event[];
  compact?: boolean;
}

export function VenueEvents({ venueId, venueName, events, compact = false }: VenueEventsProps) {
  // Filter events for this venue
  const venueEvents = events.filter(event => event.venue_id === venueId);
  
  // Get upcoming events only
  const upcomingEvents = venueEvents.filter(event => 
    new Date(event.start_date) > new Date()
  ).slice(0, compact ? 3 : 10);

  if (upcomingEvents.length === 0) {
    return null;
  }

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'MMM d, yyyy');
  };

  const formatEventTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'h:mm a');
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Upcoming Events</h4>
        {upcomingEvents.map((event) => (
          <div key={event.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
            <div className="flex-1">
              <p className="font-medium truncate">{event.title}</p>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{formatEventDate(event.start_date)}</span>
                <Clock className="h-3 w-3" />
                <span>{formatEventTime(event.start_date)}</span>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {event.event_type}
            </Badge>
          </div>
        ))}
        {venueEvents.length > 3 && (
          <p className="text-xs text-muted-foreground text-center">
            +{venueEvents.length - 3} more events
          </p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upcoming Events at {venueName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcomingEvents.map((event) => (
          <div key={event.id} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors">
            <div className="flex-1">
              <h4 className="font-medium">{event.title}</h4>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatEventDate(event.start_date)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{formatEventTime(event.start_date)}</span>
                </div>
                {event.max_attendees && (
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>Max {event.max_attendees}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{event.event_type}</Badge>
              {event.is_free ? (
                <Badge variant="outline" className="text-green-600">Free</Badge>
              ) : (
                <span className="text-sm font-medium">
                  {event.price_min ? `$${event.price_min}` : 'Price TBA'}
                </span>
              )}
              <Button size="sm" variant="outline">
                Details
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}