import { Calendar } from 'lucide-react';
import { EventCard } from '@/components/events/EventCard';
import { InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CityRelation, EventRelation } from './types';

export interface CityEventsTabProps {
  city: CityRelation;
  events: EventRelation[];
  eventsLoading: boolean;
}

export function CityEventsTab({ city, events, eventsLoading }: CityEventsTabProps) {
  if (eventsLoading) return <InlineLoading text="Loading events..." size="md" />;
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No upcoming events"
        description={`Check back later for events in ${city.name}!`}
        mood="encouraging"
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {events.map((event: EventRelation) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
