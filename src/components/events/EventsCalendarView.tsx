import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock, MapPin, Users } from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
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
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Get events for the selected date
  const eventsForSelectedDate = events.filter(event => 
    isSameDay(parseISO(event.start_date), selectedDate)
  );

  // Get dates that have events for highlighting
  const datesWithEvents = events.map(event => parseISO(event.start_date));

  // Custom day component to show event indicators
  const DayContent = ({ date, displayMonth }: { date: Date; displayMonth: Date }) => {
    const hasEvents = datesWithEvents.some(eventDate => isSameDay(eventDate, date));
    const isSelected = isSameDay(date, selectedDate);
    
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <span className={isSelected ? 'font-bold' : ''}>{date.getDate()}</span>
        {hasEvents && (
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Events Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="w-full pointer-events-auto"
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

      {/* Events for Selected Date */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Events for {format(selectedDate, 'MMMM d, yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsForSelectedDate.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No events scheduled for this date
              </p>
            ) : (
              <div className="space-y-4">
                {eventsForSelectedDate.map((event) => (
                  <div
                    key={event.id}
                    className="p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => onEventSelect?.(event)}
                  >
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">{event.title}</h4>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(parseISO(event.start_date), 'h:mm a')}
                        {event.end_date && ` - ${format(parseISO(event.end_date), 'h:mm a')}`}
                      </div>
                      
                      {event.venue_name && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {event.venue_name}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                          {event.event_type}
                        </Badge>
                        
                        {event.is_free ? (
                          <Badge variant="outline" className="text-xs">Free</Badge>
                        ) : (
                          event.price_min && (
                            <span className="text-xs text-muted-foreground">
                              ${event.price_min}
                              {event.price_max && event.price_max !== event.price_min && ` - $${event.price_max}`}
                            </span>
                          )
                        )}
                      </div>

                      {onAttendanceUpdate && (
                        <div className="flex gap-1 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAttendanceUpdate(event.id, 'going');
                            }}
                          >
                            Going
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAttendanceUpdate(event.id, 'interested');
                            }}
                          >
                            Interested
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};