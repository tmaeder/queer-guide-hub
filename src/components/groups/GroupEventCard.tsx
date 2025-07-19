import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  MapPin, 
  Users, 
  DollarSign, 
  Clock, 
  ExternalLink,
  UserPlus,
  UserMinus,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { GroupEvent } from '@/hooks/useGroupEvents';
import { useAuth } from '@/hooks/useAuth';

interface GroupEventCardProps {
  event: GroupEvent;
  onJoinEvent: (eventId: string) => void;
  onLeaveEvent: (eventId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
  isJoining: boolean;
  isLeaving: boolean;
  isDeleting: boolean;
  canManage: boolean;
}

export function GroupEventCard({ 
  event, 
  onJoinEvent, 
  onLeaveEvent, 
  onDeleteEvent,
  isJoining, 
  isLeaving,
  isDeleting,
  canManage 
}: GroupEventCardProps) {
  const { user } = useAuth();

  const formatEventDate = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end && start.toDateString() !== end.toDateString()) {
      return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
    } else if (end) {
      return `${format(start, 'MMM d, yyyy')} • ${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
    }
    return format(start, 'MMM d, yyyy • h:mm a');
  };

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      social: 'bg-blue-100 text-blue-800',
      meetup: 'bg-green-100 text-green-800',
      workshop: 'bg-purple-100 text-purple-800',
      conference: 'bg-indigo-100 text-indigo-800',
      party: 'bg-pink-100 text-pink-800',
      sports: 'bg-orange-100 text-orange-800',
      cultural: 'bg-teal-100 text-teal-800',
      educational: 'bg-yellow-100 text-yellow-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[type] || colors.other;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="text-xl">{event.title}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {formatEventDate(event.start_date, event.end_date)}
            </div>
          </div>
          <Badge className={getEventTypeColor(event.event_type)}>
            {event.event_type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {event.description && (
          <p className="text-muted-foreground">{event.description}</p>
        )}

        <div className="space-y-2">
          {(event.venue_name || event.address) && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>
                {event.venue_name && event.address 
                  ? `${event.venue_name}, ${event.address}`
                  : event.venue_name || event.address}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{event.city}{event.state && `, ${event.state}`}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              {event.attendee_count || 0} attending
              {event.max_attendees && ` • ${event.max_attendees} max`}
            </span>
          </div>

          {!event.is_free && (event.price_min || event.price_max) && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>
                {event.price_min && event.price_max && event.price_min !== event.price_max
                  ? `$${event.price_min} - $${event.price_max}`
                  : `$${event.price_min || event.price_max}`}
              </span>
            </div>
          )}

          {event.is_free && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-green-600 font-medium">Free</span>
            </div>
          )}

          {event.age_restriction && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{event.age_restriction}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-2">
            {event.user_attending ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLeaveEvent(event.id)}
                disabled={isLeaving}
              >
                <UserMinus className="h-4 w-4 mr-2" />
                {isLeaving ? "Leaving..." : "Leave"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onJoinEvent(event.id)}
                disabled={isJoining || (event.max_attendees && (event.attendee_count || 0) >= event.max_attendees)}
                className="bg-gradient-primary hover:opacity-90"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {isJoining ? "Joining..." : "Join"}
              </Button>
            )}

            {(event.ticket_url || event.website) && (
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a 
                  href={event.ticket_url || event.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {event.ticket_url ? "Tickets" : "Website"}
                </a>
              </Button>
            )}
          </div>

          {canManage && onDeleteEvent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeleteEvent(event.id)}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}