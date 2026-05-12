import { Calendar } from 'lucide-react';
import { EventCard } from '@/components/events/EventCard';
import { InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import type { CityRelation, EventRelation } from './types';

export interface CityEventsTabProps {
  city: CityRelation;
  events: EventRelation[];
  eventsLoading: boolean;
}

export function CityEventsTab({ city, events, eventsLoading }: CityEventsTabProps) {
  return (
    <ScrollReveal direction="up">
    <div className="mt-6">
      {eventsLoading ? (
        <InlineLoading text="Loading events..." size="md" />
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((event: EventRelation) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Calendar}
          title="No upcoming events"
          description={`Check back later for events in ${city.name}!`}
          mood="encouraging"
        />
      )}
    </div>
    </ScrollReveal>
  );
}
