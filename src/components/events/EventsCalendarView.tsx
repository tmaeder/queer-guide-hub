import React, { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Clock, MapPin, Users, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { format, isSameDay, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { Database } from '@/integrations/supabase/types';
type Event = Database['public']['Tables']['events']['Row'];
interface EventsCalendarViewProps {
  events: Event[];
  onEventSelect?: (event: Event) => void;
  onAttendanceUpdate?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}
export const EventsCalendarView: React.FC<EventsCalendarViewProps> = ({
  events,
  onEventSelect,
  onAttendanceUpdate
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Memoized calculations for better performance
  const {
    eventsForSelectedDate,
    datesWithEvents,
    eventCountByDate
  } = useMemo(() => {
    const eventsForDate = events.filter(event => isSameDay(parseISO(event.start_date), selectedDate));
    const eventDates = events.map(event => parseISO(event.start_date));
    const eventCounts = events.reduce((acc, event) => {
      const dateKey = format(parseISO(event.start_date), 'yyyy-MM-dd');
      acc[dateKey] = (acc[dateKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return {
      eventsForSelectedDate: eventsForDate,
      datesWithEvents: eventDates,
      eventCountByDate: eventCounts
    };
  }, [events, selectedDate]);
  const monthlyStats = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthEvents = events.filter(event => {
      const eventDate = parseISO(event.start_date);
      return eventDate >= monthStart && eventDate <= monthEnd;
    });
    return {
      totalEvents: monthEvents.length,
      eventTypes: [...new Set(monthEvents.map(e => e.event_type))].length,
      freeEvents: monthEvents.filter(e => e.is_free).length
    };
  }, [events, currentMonth]);
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCurrentMonth(date);
    }
  };
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
  };
  return;
};