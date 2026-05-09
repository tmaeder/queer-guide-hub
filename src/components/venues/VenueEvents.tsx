import { formatCurrency } from '@/lib/currency';
import { ContentLangBadge } from '@/components/i18n/ContentLangBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Users } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';

type Event = Database['public']['Tables']['events']['Row'];

interface VenueEventsProps {
  venueId: string;
  venueName: string;
  events: Event[];
  compact?: boolean;
}

export function VenueEvents({ venueId, venueName, events, compact = false }: VenueEventsProps) {
  const venueEvents = events.filter(event => event.venue_id === venueId);

  const upcomingEvents = venueEvents.filter(event =>
    new Date(event.start_date) > new Date()
  ).slice(0, compact ? 3 : 10);

  if (upcomingEvents.length === 0) {
    return null;
  }

  const formatEventDate = (dateString: string) => format(new Date(dateString), 'MMM d, yyyy');
  const formatEventTime = (dateString: string) => format(new Date(dateString), 'h:mm a');

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">Upcoming Events</p>
        {upcomingEvents.map((event) => (
          <div key={event.id} className="flex items-center justify-between p-2 bg-muted">
            <div className="flex-1">
              <p className="text-sm font-medium truncate">
                {event.title}
                <ContentLangBadge text={event.title} language={(event as { content_language?: string | null }).content_language} />
              </p>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar style={{ width: 12, height: 12 }} />
                <span className="text-xs">{formatEventDate(event.start_date)}</span>
                <Clock style={{ width: 12, height: 12 }} />
                <span className="text-xs">{formatEventTime(event.start_date)}</span>
              </div>
            </div>
            <Badge variant="outline">
              {event.event_type}
            </Badge>
          </div>
        ))}
        {venueEvents.length > 3 && (
          <span className="text-xs text-muted-foreground text-center">
            +{venueEvents.length - 3} more events
          </span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Events at {venueName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {upcomingEvents.map((event) => (
            <div key={event.id} className="flex items-center justify-between p-3 border border-border hover:bg-muted transition-colors">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {event.title}
                  <ContentLangBadge text={event.title} language={(event as { content_language?: string | null }).content_language} />
                </p>
                <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar style={{ width: 12, height: 12 }} />
                    <span className="text-sm">{formatEventDate(event.start_date)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock style={{ width: 12, height: 12 }} />
                    <span className="text-sm">{formatEventTime(event.start_date)}</span>
                  </div>
                  {event.max_attendees && (
                    <div className="flex items-center gap-1">
                      <Users style={{ width: 12, height: 12 }} />
                      <span className="text-sm">Max {event.max_attendees}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{event.event_type}</Badge>
                {event.is_free ? (
                  <Badge variant="outline">Free</Badge>
                ) : (
                  <span className="text-sm font-medium">
                    {event.price_min ? formatCurrency(event.price_min, event.currency) : 'Price TBA'}
                  </span>
                )}
                <Button size="sm" variant="outline">
                  Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
