import { EventCard } from '@/components/events/EventCard';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

interface EventGridViewProps {
  events: Event[];
  onViewDetails: (event: Event) => void;
  onUpdateAttendance?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}

/**
 * Even grid of EventCards — the same columns as the venues grid. It was a
 * mosaic whose first tiles spanned half the row, which blew an image-less
 * card's station plate up to ~650px and, on a short list, left two giant
 * cards and nothing else.
 */
export function EventGridView({ events, onViewDetails, onUpdateAttendance }: EventGridViewProps) {
  return (
    <StaggerGrid className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
