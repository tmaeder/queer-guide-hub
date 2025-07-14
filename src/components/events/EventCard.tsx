import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Clock, DollarSign, ExternalLink } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

type Event = Database['public']['Tables']['events']['Row'] & {
  venues?: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
  } | null;
};

interface EventCardProps {
  event: Event & {
    event_attendees?: Array<{ status: string }>;
  };
  onViewDetails?: (event: Event) => void;
  onUpdateAttendance?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}

export function EventCard({ event, onViewDetails, onUpdateAttendance }: EventCardProps) {
  const attendeeCount = event.event_attendees?.filter(a => a.status === 'going').length || 0;

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      party: 'bg-primary/10 text-primary',
      workshop: 'bg-accent/10 text-accent',
      meetup: 'bg-secondary/10 text-secondary',
      pride: 'bg-gradient-primary text-primary-foreground',
      rally: 'bg-destructive/10 text-destructive',
    };
    return colors[type] || 'bg-muted/10 text-muted-foreground';
  };

  const formatEventDate = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    return format(start, 'MMM d, yyyy');
  };

  const formatEventTime = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end) {
      return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
    }
    return format(start, 'h:mm a');
  };

  const getPriceDisplay = () => {
    if (event.is_free) return 'Free';
    if (event.price_min && event.price_max) {
      if (event.price_min === event.price_max) {
        return `$${event.price_min}`;
      }
      return `$${event.price_min} - $${event.price_max}`;
    }
    if (event.price_min) return `From $${event.price_min}`;
    return 'Price TBA';
  };

  return (
    <Card className="group hover:shadow-elegant transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg group-hover:text-primary transition-colors line-clamp-2">
              {event.title}
              {event.featured && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Featured
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span className="text-sm">{formatEventDate(event.start_date, event.end_date)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-sm">{formatEventTime(event.start_date, event.end_date)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={getEventTypeColor(event.event_type)}>
              {event.event_type}
            </Badge>
            {event.is_free ? (
              <Badge variant="outline" className="text-accent">
                Free
              </Badge>
            ) : (
              <div className="flex items-center gap-1 text-sm">
                <DollarSign className="h-3 w-3" />
                <span>{getPriceDisplay()}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}

        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span className="text-sm">
            {event.venues?.name || event.venue_name || 'Location TBA'} • {event.city}, {event.state}
          </span>
        </div>

        {event.venues && (
          <div className="text-xs text-muted-foreground">
            {event.venues.address}
            {event.venues.phone && (
              <span className="ml-2">• {event.venues.phone}</span>
            )}
          </div>
        )}

        {event.tags && event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {event.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{event.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{attendeeCount} going</span>
            </div>
            {event.age_restriction && (
              <Badge variant="outline" className="text-xs">
                {event.age_restriction}
              </Badge>
            )}
          </div>
          
          <div className="flex gap-1">
            {event.venues?.website && (
              <Button size="sm" variant="outline" className="h-6 w-6 p-0" asChild>
                <a href={event.venues.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            {event.ticket_url && (
              <Button size="sm" variant="outline" className="h-6 w-6 p-0" asChild>
                <a href={event.ticket_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            <Link to={`/events/${event.id}`}>
              <Button size="sm" variant="outline" className="text-xs">
                View Details
              </Button>
            </Link>
          </div>
        </div>

        {onUpdateAttendance && (
          <div className="flex gap-2 pt-2 border-t">
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateAttendance(event.id, 'going');
              }}
            >
              Going
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateAttendance(event.id, 'interested');
              }}
            >
              Interested
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}