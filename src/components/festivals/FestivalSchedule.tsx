import { Link } from 'react-router-dom';
import { Clock, MapPin } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { format, parseISO } from 'date-fns';
import { formatEventTime } from '@/lib/event-time';
import type { Database } from '@/integrations/supabase/types';

type EventRow = Database['public']['Tables']['events']['Row'] & {
  venues?: { id: string; name: string } | null;
};

interface FestivalScheduleProps {
  events: EventRow[];
  timezone?: string | null;
}

export function FestivalSchedule({ events, timezone }: FestivalScheduleProps) {
  if (events.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No events scheduled yet.</Typography>
      </Paper>
    );
  }

  // Group events by day
  const grouped = events.reduce<Record<string, EventRow[]>>((acc, event) => {
    const day = format(parseISO(event.start_date), 'yyyy-MM-dd');
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {});

  const sortedDays = Object.keys(grouped).sort();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {sortedDays.map((day, dayIdx) => (
        <Box key={day}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            {format(parseISO(day), 'EEEE, MMMM d, yyyy')}
            <Chip size="small" label={`${grouped[day].length} event${grouped[day].length !== 1 ? 's' : ''}`} />
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 2, borderLeft: 3, borderColor: 'primary.main' }}>
            {grouped[day].map(event => (
              <Link key={event.id} to={`/events/${event.id}`} style={{ textDecoration: 'none' }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                    transition: 'all 0.15s',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={600}>{event.title}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          icon={<Clock style={{ width: 12, height: 12 }} />}
                          label={formatEventTime(event.start_date, event.end_date, timezone)}
                          variant="outlined"
                        />
                        {event.venues?.name && (
                          <Chip
                            size="small"
                            icon={<MapPin style={{ width: 12, height: 12 }} />}
                            label={event.venues.name}
                            variant="outlined"
                          />
                        )}
                        {event.event_type && (
                          <Chip size="small" label={event.event_type} variant="outlined" />
                        )}
                      </Box>
                    </Box>
                    {event.is_free && <Chip size="small" label="Free" color="success" />}
                  </Box>
                </Paper>
              </Link>
            ))}
          </Box>
          {dayIdx < sortedDays.length - 1 && <Divider sx={{ mt: 2 }} />}
        </Box>
      ))}
    </Box>
  );
}
