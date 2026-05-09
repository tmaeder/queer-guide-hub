import { formatCurrency } from '@/lib/currency';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  Trash2,
} from 'lucide-react';
import { formatEventDateTime } from '@/lib/event-time';
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
  canManage,
}: GroupEventCardProps) {
  const { _user } = useAuth();

  const formatEventDate = (startDate: string, endDate?: string) => {
    return formatEventDateTime(startDate, endDate);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <h6 className="text-base font-semibold">{event.title}</h6>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <p className="text-sm text-muted-foreground">
                {formatEventDate(event.start_date, event.end_date)}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="font-medium">
            {event.event_type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}

          <div className="flex flex-col gap-2">
            {(event.venue_name || event.address) && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm">
                  {event.venue_name && event.address
                    ? `${event.venue_name}, ${event.address}`
                    : event.venue_name || event.address}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm">
                {event.city}
                {event.state && `, ${event.state}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm">
                {event.attendee_count || 0} attending
                {event.max_attendees && ` • ${event.max_attendees} max`}
              </p>
            </div>

            {!event.is_free && (event.price_min || event.price_max) && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm">
                  {event.price_min && event.price_max && event.price_min !== event.price_max
                    ? `${formatCurrency(event.price_min)} - ${formatCurrency(event.price_max)}`
                    : formatCurrency(event.price_min || event.price_max || 0)}
                </p>
              </div>
            )}

            {event.is_free && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Free</p>
              </div>
            )}

            {event.age_restriction && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm">{event.age_restriction}</p>
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
                  <UserMinus className="w-4 h-4 mr-2" />
                  {isLeaving ? 'Leaving...' : 'Leave'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onJoinEvent(event.id)}
                  disabled={
                    isJoining ||
                    (event.max_attendees && (event.attendee_count || 0) >= event.max_attendees)
                  }
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {isJoining ? 'Joining...' : 'Join'}
                </Button>
              )}

              {(event.ticket_url || event.website) && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={event.ticket_url || event.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {event.ticket_url ? 'Tickets' : 'Website'}
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
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
