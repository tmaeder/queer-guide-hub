import React, { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Clock, MapPin, Users, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Eye, Star, Ticket, ExternalLink } from 'lucide-react';
import { format, isSameDay, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { Database } from '@/integrations/supabase/types';
import { formatEventTime } from '@/lib/event-time';
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
  return (
    <div className="space-y-6">
      {/* Enhanced Month Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <CalendarIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{monthlyStats.totalEvents}</p>
                <p className="text-sm text-muted-foreground">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Ticket className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{monthlyStats.freeEvents}</p>
                <p className="text-sm text-muted-foreground">Free Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Star className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{monthlyStats.eventTypes}</p>
                <p className="text-sm text-muted-foreground">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Calendar Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Section */}
        <div className="lg:col-span-2">
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-lg">
              <div className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                  </div>
                  {format(currentMonth, 'MMMM yyyy')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="hover:bg-primary/10 hover:text-primary transition-colors"
                    aria-label="Previous month" 
                    onClick={() => navigateMonth('prev')}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="hover:bg-primary/10 hover:text-primary transition-colors"
                    aria-label="Next month" 
                    onClick={() => navigateMonth('next')}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                className="rounded-lg border-0 w-full"
                modifiers={{
                  hasEvents: datesWithEvents
                }}
                modifiersStyles={{
                  hasEvents: {
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                    color: 'hsl(var(--primary))',
                    fontWeight: 'bold'
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Events Section */}
        <div className="lg:col-span-1">
          <Card className="shadow-lg h-full">
            <CardHeader className="bg-gradient-to-r from-secondary/5 to-secondary/10 rounded-t-lg">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse"></div>
                {format(selectedDate, 'MMM d, yyyy')}
              </CardTitle>
              {eventsForSelectedDate.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {eventsForSelectedDate.length} event{eventsForSelectedDate.length !== 1 ? 's' : ''} found
                </p>
              )}
            </CardHeader>
            <CardContent className="p-4">
              {eventsForSelectedDate.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                    <CalendarIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">No events scheduled</p>
                  <p className="text-xs text-muted-foreground mt-1">Select another date to explore</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {eventsForSelectedDate.map((event) => (
                      <div key={event.id} className="group relative">
                        <div className="rounded-lg border-2 border-transparent bg-gradient-to-br from-card to-card/50 p-4 shadow-sm transition-all duration-200 hover:border-primary/20 hover:shadow-md hover:scale-[1.02]">
                          {/* Event Header */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <h3 
                              className="font-semibold text-sm leading-tight cursor-pointer hover:text-primary transition-colors line-clamp-2"
                              onClick={() => onEventSelect?.(event)}
                            >
                              {event.title}
                            </h3>
                            <div className="flex gap-1 flex-shrink-0">
                              {event.is_free && (
                                <Badge variant="secondary" className="text-xs px-2 py-1">
                                  Free
                                </Badge>
                              )}
                              {event.featured && (
                                <Badge variant="default" className="text-xs px-2 py-1">
                                  <Star className="h-3 w-3 mr-1" />
                                  Featured
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Event Details */}
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 flex-shrink-0" />
                              <span>{formatEventTime(event.start_date, event.end_date)}</span>
                            </div>
                            
                            {(event.venue_name || event.city) && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">
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
                              className="flex-1 hover:bg-primary hover:text-primary-foreground transition-colors"
                              onClick={() => onEventSelect?.(event)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            
                            {onAttendanceUpdate && (
                              <>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button size="sm" variant="default" className="flex-1">
                                      <Users className="h-3 w-3 mr-1" />
                                      Attend
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-48 p-2" align="center">
                                    <div className="space-y-2">
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
                              </>
                            )}
                          </div>

                          {/* Hover Indicator */}
                          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
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