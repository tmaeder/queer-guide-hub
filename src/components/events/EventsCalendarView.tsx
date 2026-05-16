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

type Event = Database['public']['Tables']['events']['Row'];
interface EventsCalendarViewProps {
  events: Event[];
  onEventSelect?: (event: Event) => void;
  onAttendanceUpdate?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}
export const EventsCalendarView = ({
  events,
  onEventSelect,
  onAttendanceUpdate,
}: EventsCalendarViewProps) => {
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
    <div className="flex flex-col gap-6">
      {monthlyStats.totalEvents === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="mx-auto mb-3 w-12 h-12 bg-muted rounded-full flex items-center justify-center">
              <CalendarIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              No events yet for {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Be the first — submit one to fill the month.
            </p>
            <Button asChild>
              <a href="/submit/event">Submit an Event</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-element relative">
                  <CalendarIcon className="h-5 w-5" />
                </div>
                <div>
                  <h5 className="text-2xl font-bold text-primary">
                    {monthlyStats.totalEvents}
                  </h5>
                  <p className="text-sm text-muted-foreground">Total Events</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted relative">
                  <Ticket className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <h5 className="text-2xl font-bold text-foreground">
                    {monthlyStats.freeEvents}
                  </h5>
                  <p className="text-sm text-muted-foreground">Free Events</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-element bg-muted relative">
                  <Star className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h5 className="text-2xl font-bold text-secondary-foreground">
                    {monthlyStats.eventTypes}
                  </h5>
                  <p className="text-sm text-muted-foreground">Categories</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Calendar Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Section */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  <div className="p-2 bg-muted rounded-element relative">
                    <CalendarIcon className="h-5 w-5" />
                  </div>
                  {format(currentMonth, 'MMMM yyyy')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => navigateMonth('prev')}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next month"
                    onClick={() => navigateMonth('next')}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
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
                    // Visible dot indicator under days with events.
                    boxShadow: 'inset 0 -3px 0 0 hsl(var(--primary))',
                  },
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Events Section */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                {format(selectedDate, 'MMM d, yyyy')}
              </CardTitle>
              {eventsForSelectedDate.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {eventsForSelectedDate.length} event
                  {eventsForSelectedDate.length !== 1 ? 's' : ''} found
                </p>
              )}
            </CardHeader>
            <CardContent>
              {eventsForSelectedDate.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                    <CalendarIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    No events scheduled
                  </p>
                  <span className="text-xs text-muted-foreground mt-1">
                    Select another date to explore
                  </span>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="flex flex-col gap-4">
                    {eventsForSelectedDate.map((event) => (
                      <div key={event.id} className="relative">
                        <div className="p-4 transition-all border-2 border-transparent rounded-element hover:border-primary hover:shadow-lg hover:scale-[1.02] bg-card">
                          {/* Event Header */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <button
                              type="button"
                              className="text-sm font-semibold cursor-pointer hover:text-primary transition-colors line-clamp-2 text-left bg-transparent border-0 p-0"
                              onClick={() => onEventSelect?.(event)}
                            >
                              {event.title}
                            </button>
                            <div className="flex gap-1 flex-shrink-0">
                              {event.is_free && (
                                <Badge variant="secondary" className="text-xs px-2 py-1">
                                  Free
                                </Badge>
                              )}
                              {event.is_featured && (
                                <Badge variant="default" className="text-xs px-2 py-1">
                                  <Star className="h-3 w-3 mr-1" />
                                  Featured
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Event Details */}
                          <div className="flex flex-col gap-2 mb-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-3 w-3 flex-shrink-0" />
                              <span className="text-xs">
                                {formatEventTime(event.start_date, event.end_date)}
                              </span>
                            </div>

                            {(event.venue_name || event.city) && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                <span className="text-xs truncate">
                                  {event.venue_name && `${event.venue_name}, `}
                                  {event.city}
                                </span>
                              </div>
                            )}

                            {event.event_type && (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {event.event_type}
                                </Badge>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => onEventSelect?.(event)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>

                            {onAttendanceUpdate && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="default" className="flex-1">
                                    <Users className="h-3 w-3 mr-1" />
                                    Attend
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-2" align="center">
                                  <div className="flex flex-col gap-2">
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="w-full"
                                      onClick={() => onAttendanceUpdate(event.id, 'going')}
                                    >
                                      I'm Going
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full"
                                      onClick={() => onAttendanceUpdate(event.id, 'interested')}
                                    >
                                      Interested
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="w-full text-muted-foreground"
                                      onClick={() => onAttendanceUpdate(event.id, 'not_going')}
                                    >
                                      Not Going
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
