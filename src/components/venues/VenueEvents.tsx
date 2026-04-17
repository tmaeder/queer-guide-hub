import React from 'react';
import { formatCurrency } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Users } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }} color="text.secondary">Upcoming Events</Typography>
        {upcomingEvents.map((event) => (
          <Box key={event.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                <Calendar style={{ width: 12, height: 12 }} />
                <Typography variant="caption">{formatEventDate(event.start_date)}</Typography>
                <Clock style={{ width: 12, height: 12 }} />
                <Typography variant="caption">{formatEventTime(event.start_date)}</Typography>
              </Box>
            </Box>
            <Badge variant="outline">
              {event.event_type}
            </Badge>
          </Box>
        ))}
        {venueEvents.length > 3 && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
            +{venueEvents.length - 3} more events
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Events at {venueName}</CardTitle>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {upcomingEvents.map((event) => (
            <Box key={event.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' }, transition: 'background-color 0.2s' }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{event.title}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5, color: 'text.secondary' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Calendar style={{ width: 12, height: 12 }} />
                    <Typography variant="body2">{formatEventDate(event.start_date)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Clock style={{ width: 12, height: 12 }} />
                    <Typography variant="body2">{formatEventTime(event.start_date)}</Typography>
                  </Box>
                  {event.max_attendees && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Users style={{ width: 12, height: 12 }} />
                      <Typography variant="body2">Max {event.max_attendees}</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge variant="outline">{event.event_type}</Badge>
                {event.is_free ? (
                  <Badge variant="outline">Free</Badge>
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {event.price_min ? formatCurrency(event.price_min) : 'Price TBA'}
                  </Typography>
                )}
                <Button size="sm" variant="outline">
                  Details
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
