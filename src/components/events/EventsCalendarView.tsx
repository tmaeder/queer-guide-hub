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
  return <div className="space-y-6">
      {/* Month Statistics */}
      

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Calendar */}
        <div className="xl:col-span-3">
          <Card className="overflow-hidden">
            <CardHeader className="bg-card">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl gradient-text">
                  {format(currentMonth, 'MMMM yyyy')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')} className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                  const today = new Date();
                  setCurrentMonth(today);
                  setSelectedDate(today);
                }} className="h-8 px-3 text-xs">
                    Today
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigateMonth('next')} className="h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} month={currentMonth} onMonthChange={setCurrentMonth} className="w-full pointer-events-auto" modifiers={{
              hasEvents: datesWithEvents
            }} modifiersStyles={{
              hasEvents: {
                backgroundColor: 'hsl(var(--primary) / 0.1)',
                color: 'hsl(var(--primary))',
                fontWeight: 'bold',
                position: 'relative'
              }
            }} components={{
              DayContent: ({
                date
              }) => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const eventCount = eventCountByDate[dateKey];
                const hasEvents = !!eventCount;
                const isToday = isSameDay(date, new Date());
                const isSelected = isSameDay(date, selectedDate);
                return <div className="relative w-full h-full flex flex-col items-center justify-center p-1">
                        <span className={`text-sm ${isSelected ? 'font-bold' : ''} ${isToday ? 'text-primary font-semibold' : ''}`}>
                          {date.getDate()}
                        </span>
                        {hasEvents && <div className="flex items-center justify-center mt-0.5">
                            {eventCount === 1 ? <div className="w-1.5 h-1.5 bg-primary rounded-full" /> : eventCount === 2 ? <div className="flex gap-0.5">
                                <div className="w-1 h-1 bg-primary rounded-full" />
                                <div className="w-1 h-1 bg-primary rounded-full" />
                              </div> : <Badge variant="secondary" className="text-[8px] h-3 px-1 min-w-0 rounded-full">
                                {eventCount}
                              </Badge>}
                          </div>}
                      </div>;
              }
            }} />
            </CardContent>
          </Card>
        </div>

        {/* Events for Selected Date */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                {format(selectedDate, 'MMM d, yyyy')}
              </CardTitle>
              {eventsForSelectedDate.length > 0 && <Badge variant="secondary" className="w-fit">
                  {eventsForSelectedDate.length} event{eventsForSelectedDate.length !== 1 ? 's' : ''}
                </Badge>}
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {eventsForSelectedDate.length === 0 ? <div className="p-6 text-center">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm">
                      No events scheduled for this date
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select a different date to see events
                    </p>
                  </div> : <div className="space-y-3 p-4">
                    {eventsForSelectedDate.map((event, index) => <div key={event.id}>
                        <div className="group p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 cursor-pointer transition-all duration-200 hover-scale" onClick={() => onEventSelect?.(event)}>
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">
                                {event.title}
                              </h4>
                              <Eye className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {format(parseISO(event.start_date), 'h:mm a')}
                                  {event.end_date && ` - ${format(parseISO(event.end_date), 'h:mm a')}`}
                                </span>
                              </div>
                              
                              {event.venue_name && <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{event.venue_name}</span>
                                </div>}
                            </div>
                            
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <Badge variant="outline" className="text-xs">
                                {event.event_type.replace('-', ' ')}
                              </Badge>
                              
                              {event.is_free ? <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 hover:bg-green-200">
                                  Free
                                </Badge> : event.price_min && <span className="text-xs text-muted-foreground font-medium">
                                    ${event.price_min}
                                    {event.price_max && event.price_max !== event.price_min && `-$${event.price_max}`}
                                  </span>}
                            </div>

                            {event.description && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {event.description}
                              </p>}

                            {onAttendanceUpdate && <div className="flex gap-2 pt-2 border-t border-border/50">
                                <Button size="sm" variant="outline" className="text-xs h-7 flex-1 hover:bg-green-50 hover:border-green-200 hover:text-green-700" onClick={e => {
                          e.stopPropagation();
                          onAttendanceUpdate(event.id, 'going');
                        }}>
                                  Going
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs h-7 flex-1 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700" onClick={e => {
                          e.stopPropagation();
                          onAttendanceUpdate(event.id, 'interested');
                        }}>
                                  Interested
                                </Button>
                              </div>}
                          </div>
                        </div>
                        {index < eventsForSelectedDate.length - 1 && <Separator className="my-3" />}
                      </div>)}
                  </div>}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>;
};