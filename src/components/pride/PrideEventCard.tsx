import { Link } from 'react-router';
import { MapPin, Calendar, Star, Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';
import { rangesOverlap } from '@/components/trips/tripOverlap';
import { useActiveTrip } from '@/hooks/useActiveTrip';

interface PrideEventCardProps {
  event: PrideCalendarEvent;
  highlighted?: boolean;
  compact?: boolean;
  onSelect?: (id: string) => void;
}

function formatDateRange(start: string, end: string | null) {
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const sameDay = e && s.toDateString() === e.toDateString();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!e || sameDay) return s.toLocaleDateString(undefined, opts);
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

export function PrideEventCard({ event, highlighted, compact, onSelect }: PrideEventCardProps) {
  const { user } = useAuth();
  const { activeTrip } = useActiveTrip();
  const [dialogOpen, setDialogOpen] = useState(false);

  const inTripWindow =
    !!activeTrip &&
    rangesOverlap(
      { start_date: event.start_date, end_date: event.end_date },
      { start_date: activeTrip.start_date, end_date: activeTrip.end_date },
    );

  return (
    <article
      className={cn(
        'group flex flex-col rounded-container border border-foreground/15 bg-background overflow-hidden transition-colors',
        highlighted && 'border-foreground',
        !compact && 'hover:border-foreground',
      )}
      onClick={() => onSelect?.(event.id)}
    >
      <div className="flex-1 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn('font-medium leading-tight', compact ? 'text-sm' : 'text-base')}>
            <Link to={`/events/${event.slug}`} className="hover:underline">
              {event.title}
            </Link>
          </h3>
          {event.is_featured && (
            <Star className="size-3.5 shrink-0 fill-foreground text-foreground" aria-label="Featured" />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs2 text-foreground/70">
          <MapPin className="size-3" />
          <span>{[event.city, event.country].filter(Boolean).join(', ')}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs2 text-foreground/70">
          <Calendar className="size-3" />
          <span>{formatDateRange(event.start_date, event.end_date)}</span>
        </div>
        {inTripWindow && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs rounded-badge bg-foreground text-background">
            <Luggage className="size-3" />
            In your trip window
          </div>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-foreground/10">
          <Button
            size="sm"
            variant="outline"
            disabled={!user}
            onClick={(e) => {
              e.stopPropagation();
              setDialogOpen(true);
            }}
            className="flex-1"
          >
            <Luggage className="size-3.5 mr-1" />
            {user ? 'Add to trip' : 'Sign in'}
          </Button>
          <Button asChild size="sm" className="flex-1">
            <Link to={`/events/${event.slug}`}>View</Link>
          </Button>
        </div>
      )}
      <AddToTripDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        entity={{ type: 'event', id: event.id, name: event.title }}
      />
    </article>
  );
}
