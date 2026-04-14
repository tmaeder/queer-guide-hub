import { formatCurrency } from '@/lib/currency';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { formatEventDateTime } from '@/lib/event-time';
import { GroupEvent } from '@/hooks/useGroupEvents';
import { useAuth } from '@/hooks/useAuth';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

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

const eventTypeColors: Record<string, { bgcolor: string; color: string }> = {
  social: { bgcolor: '#dbeafe', color: '#1e40af' },
  meetup: { bgcolor: '#dcfce7', color: '#166534' },
  workshop: { bgcolor: '#f3e8ff', color: '#6b21a8' },
  conference: { bgcolor: '#e0e7ff', color: '#3730a3' },
  party: { bgcolor: '#fce7f3', color: '#9d174d' },
  sports: { bgcolor: '#ffedd5', color: '#9a3412' },
  cultural: { bgcolor: '#ccfbf1', color: '#115e59' },
  educational: { bgcolor: '#fef9c3', color: '#854d0e' },
  other: { bgcolor: '#f3f4f6', color: '#1f2937' },
};

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
  const { _user } = useAuth();

  const formatEventDate = (startDate: string, endDate?: string) => {
    return formatEventDateTime(startDate, endDate);
  };

  const getEventTypeColor = (type: string) => {
    return eventTypeColors[type] || eventTypeColors.other;
  };

  return (
    <Card>
      <CardHeader>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="h6">{event.title}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Calendar style={{ width: 16, height: 16 }} />
              <Typography variant="body2" color="text.secondary">
                {formatEventDate(event.start_date, event.end_date)}
              </Typography>
            </Box>
          </Box>
          <Chip
            label={event.event_type}
            size="small"
            sx={{
              bgcolor: getEventTypeColor(event.event_type).bgcolor,
              color: getEventTypeColor(event.event_type).color,
              fontWeight: 500,
            }}
          />
        </Box>
      </CardHeader>

      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {event.description && (
            <Typography variant="body2" color="text.secondary">{event.description}</Typography>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(event.venue_name || event.address) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MapPin style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                <Typography variant="body2">
                  {event.venue_name && event.address
                    ? `${event.venue_name}, ${event.address}`
                    : event.venue_name || event.address}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
              <Typography variant="body2">
                {event.city}{event.state && `, ${event.state}`}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Users style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
              <Typography variant="body2">
                {event.attendee_count || 0} attending
                {event.max_attendees && ` \u2022 ${event.max_attendees} max`}
              </Typography>
            </Box>

            {!event.is_free && (event.price_min || event.price_max) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DollarSign style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                <Typography variant="body2">
                  {event.price_min && event.price_max && event.price_min !== event.price_max
                    ? `${formatCurrency(event.price_min)} - ${formatCurrency(event.price_max)}`
                    : formatCurrency(event.price_min || event.price_max || 0)}
                </Typography>
              </Box>
            )}

            {event.is_free && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DollarSign style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 500 }}>Free</Typography>
              </Box>
            )}

            {event.age_restriction && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Clock style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                <Typography variant="body2">{event.age_restriction}</Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {event.user_attending ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onLeaveEvent(event.id)}
                  disabled={isLeaving}
                >
                  <UserMinus style={{ width: 16, height: 16, marginRight: 8 }} />
                  {isLeaving ? "Leaving..." : "Leave"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onJoinEvent(event.id)}
                  disabled={isJoining || (event.max_attendees && (event.attendee_count || 0) >= event.max_attendees)}
                >
                  <UserPlus style={{ width: 16, height: 16, marginRight: 8 }} />
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
                    <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                    {event.ticket_url ? "Tickets" : "Website"}
                  </a>
                </Button>
              )}
            </Box>

            {canManage && onDeleteEvent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDeleteEvent(event.id)}
                disabled={isDeleting}
              >
                <Trash2 style={{ width: 16, height: 16, color: 'var(--destructive)' }} />
              </Button>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
