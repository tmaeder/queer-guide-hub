import { EventCard } from '@/components/events/EventCard';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { spansForPreset } from '@/components/discovery';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

const EVENT_SPAN_CLASS: Record<string, string> = {
  sm: 'col-span-12 sm:col-span-6 md:col-span-4',
  md: 'col-span-12 sm:col-span-6 md:col-span-4',
  lg: 'col-span-12 sm:col-span-6 md:col-span-6',
  wide: 'col-span-12 md:col-span-8',
  tall: 'col-span-12 sm:col-span-6 md:col-span-4 row-span-2',
};

interface EventGridViewProps {
  events: Event[];
  onViewDetails: (event: Event) => void;
  onUpdateAttendance?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}

/** Mosaic grid of EventCards. */
export function EventGridView({ events, onViewDetails, onUpdateAttendance }: EventGridViewProps) {
  return (
    <StaggerGrid
      className="grid grid-cols-12 gap-4 md:gap-4"
      itemClassName={(i) => EVENT_SPAN_CLASS[spansForPreset('mosaic', i, events.length)]}
    >
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          onViewDetails={onViewDetails}
          onUpdateAttendance={onUpdateAttendance}
        />
      ))}
    </StaggerGrid>
  );
}
