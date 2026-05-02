import React, { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  MapPin,
  Users,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Eye,
  Star,
  Ticket,
} from 'lucide-react';
import {
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { formatEventTime } from '@/lib/event-time';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

type Event = Database['public']['Tables']['events']['Row'];
interface EventsCalendarViewProps {
  events: Event[];
  onEventSelect?: (event: Event) => void;
  onAttendanceUpdate?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}
export const EventsCalendarView: React.FC<EventsCalendarViewProps> = ({
  events,
  onEventSelect,
  onAttendanceUpdate,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Memoized calculations for better performance
  const { eventsForSelectedDate, datesWithEvents } = useMemo(() => {
    const eventsForDate = events.filter((event) =>
      isSameDay(parseISO(event.start_date), selectedDate),
    );
    const eventDates = events.map((event) => parseISO(event.start_date));
    const eventCounts = events.reduce(
      (acc, event) => {
        const dateKey = format(parseISO(event.start_date), 'yyyy-MM-dd');
        acc[dateKey] = (acc[dateKey] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return {
      eventsForSelectedDate: eventsForDate,
      datesWithEvents: eventDates,
      eventCountByDate: eventCounts,
    };
  }, [events, selectedDate]);
  const monthlyStats = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthEvents = events.filter((event) => {
      const eventDate = parseISO(event.start_date);
      return eventDate >= monthStart && eventDate <= monthEnd;
    });
    return {
      totalEvents: monthEvents.length,
      eventTypes: [...new Set(monthEvents.map((e) => e.event_type))].length,
      freeEvents: monthEvents.filter((e) => e.is_free).length,
    };
  }, [events, currentMonth]);
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCurrentMonth(date);
    }
  };
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => (direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1)));
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Enhanced Month Stats */}
      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}
      >
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 2, position: 'relative' }}>
                <CalendarIcon style={{ height: 20, width: 20 }} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  {monthlyStats.totalEvents}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Events
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  p: 1,
                  bgcolor: 'success.main',
                  borderRadius: 2,
                  opacity: 0.1,
                  position: 'relative',
                }}
              >
                <Ticket style={{ height: 20, width: 20, color: 'hsl(var(--brand))' }} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                  {monthlyStats.freeEvents}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Free Events
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover', position: 'relative' }}>
                <Star style={{ height: 20, width: 20, color: 'hsl(var(--muted-foreground))' }} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                  {monthlyStats.eventTypes}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Categories
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Main Calendar Layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
        {/* Calendar Section */}
        <Box>
          <Card>
            <CardHeader>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CardTitle>
                  <Box
                    sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 2, position: 'relative' }}
                  >
                    <CalendarIcon style={{ height: 20, width: 20 }} />
                  </Box>
                  {format(currentMonth, 'MMMM yyyy')}
                </CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => navigateMonth('prev')}
                  >
                    <ChevronLeft style={{ height: 20, width: 20 }} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next month"
                    onClick={() => navigateMonth('next')}
                  >
                    <ChevronRight style={{ height: 20, width: 20 }} />
                  </Button>
                </Box>
              </Box>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                style={{ borderRadius: 8, border: 'none', width: '100%' }}
                modifiers={{
                  hasEvents: datesWithEvents,
                }}
                modifiersStyles={{
                  hasEvents: {
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                    color: 'hsl(var(--primary))',
                    fontWeight: 'bold',
                  },
                }}
              />
            </CardContent>
          </Card>
        </Box>

        {/* Events Section */}
        <Box>
          <Card>
            <CardHeader>
              <CardTitle>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    bgcolor: 'primary.main',
                    borderRadius: '50%',
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }}
                />
                {format(selectedDate, 'MMM d, yyyy')}
              </CardTitle>
              {eventsForSelectedDate.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {eventsForSelectedDate.length} event
                  {eventsForSelectedDate.length !== 1 ? 's' : ''} found
                </Typography>
              )}
            </CardHeader>
            <CardContent>
              {eventsForSelectedDate.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <Box
                    sx={{
                      mx: 'auto',
                      width: 48,
                      height: 48,
                      bgcolor: 'action.hover',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2,
                    }}
                  >
                    <CalendarIcon
                      style={{ height: 24, width: 24, color: 'var(--muted-foreground)' }}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    No events scheduled
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    Select another date to explore
                  </Typography>
                </Box>
              ) : (
                <ScrollArea style={{ height: 400, paddingRight: 16 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {eventsForSelectedDate.map((event) => (
                      <Box key={event.id} sx={{ position: 'relative' }}>
                        <Paper
                          sx={{
                            p: 2,
                            transition: 'all 0.2s',
                            border: 2,
                            borderColor: 'transparent',
                            '&:hover': {
                              borderColor: 'primary.main',
                              boxShadow: 3,
                              transform: 'scale(1.02)',
                            },
                          }}
                        >
                          {/* Event Header */}
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: 1.5,
                              mb: 1.5,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                cursor: 'pointer',
                                '&:hover': { color: 'primary.main' },
                                transition: 'color 0.2s',
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                              onClick={() => onEventSelect?.(event)}
                            >
                              {event.title}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                              {event.is_free && (
                                <Badge
                                  variant="secondary"
                                  style={{
                                    fontSize: '0.75rem',
                                    paddingLeft: 8,
                                    paddingRight: 8,
                                    paddingTop: 4,
                                    paddingBottom: 4,
                                  }}
                                >
                                  Free
                                </Badge>
                              )}
                              {event.is_featured && (
                                <Badge
                                  variant="default"
                                  style={{
                                    fontSize: '0.75rem',
                                    paddingLeft: 8,
                                    paddingRight: 8,
                                    paddingTop: 4,
                                    paddingBottom: 4,
                                  }}
                                >
                                  <Star style={{ height: 12, width: 12, marginRight: 4 }} />
                                  Featured
                                </Badge>
                              )}
                            </Box>
                          </Box>

                          {/* Event Details */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                color: 'text.secondary',
                              }}
                            >
                              <Clock style={{ height: 12, width: 12, flexShrink: 0 }} />
                              <Typography variant="caption">
                                {formatEventTime(event.start_date, event.end_date)}
                              </Typography>
                            </Box>

                            {(event.venue_name || event.city) && (
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  color: 'text.secondary',
                                }}
                              >
                                <MapPin style={{ height: 12, width: 12, flexShrink: 0 }} />
                                <Typography
                                  variant="caption"
                                  sx={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {event.venue_name && `${event.venue_name}, `}
                                  {event.city}
                                </Typography>
                              </Box>
                            )}

                            {event.event_type && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                                  {event.event_type}
                                </Badge>
                              </Box>
                            )}
                          </Box>

                          {/* Action Buttons */}
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              size="sm"
                              variant="outline"
                              style={{ flex: 1 }}
                              onClick={() => onEventSelect?.(event)}
                            >
                              <Eye style={{ height: 12, width: 12, marginRight: 4 }} />
                              View
                            </Button>

                            {onAttendanceUpdate && (
                              <>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button size="sm" variant="default" style={{ flex: 1 }}>
                                      <Users style={{ height: 12, width: 12, marginRight: 4 }} />
                                      Attend
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent style={{ width: 192, padding: 8 }} align="center">
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                      <Button
                                        size="sm"
                                        variant="default"
                                        style={{ width: '100%' }}
                                        onClick={() => onAttendanceUpdate(event.id, 'going')}
                                      >
                                        I'm Going
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        style={{ width: '100%' }}
                                        onClick={() => onAttendanceUpdate(event.id, 'interested')}
                                      >
                                        Interested
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        style={{ width: '100%', color: 'var(--muted-foreground)' }}
                                        onClick={() => onAttendanceUpdate(event.id, 'not_going')}
                                      >
                                        Not Going
                                      </Button>
                                    </Box>
                                  </PopoverContent>
                                </Popover>
                              </>
                            )}
                          </Box>

                          {/* Hover Indicator */}
                          <Box
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              borderRadius: 2,
                              background:
                                'linear-gradient(to right, hsl(var(--foreground) / 0.02), hsl(var(--foreground) / 0.04))',
                              opacity: 0,
                              transition: 'opacity 0.2s',
                              pointerEvents: 'none',
                              '.MuiBox-root:hover > &': { opacity: 1 },
                            }}
                          />
                        </Paper>
                      </Box>
                    ))}
                  </Box>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};
