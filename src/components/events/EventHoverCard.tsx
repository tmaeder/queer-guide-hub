import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Calendar as CalendarIcon, MapPin, Star, Ticket, Users, Plus, Check } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatEventTime } from '@/lib/event-time';
import { useTranslation } from 'react-i18next';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';

type Event = Database['public']['Tables']['events']['Row'];

interface EventHoverCardProps {
  event: Event;
  children: ReactNode;
  onRsvp?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void | Promise<void>;
  /** When true, the Save button opens AddToTripDialog inline. */
  enableSaveToTrip?: boolean;
  /** Optional custom save handler — takes precedence over the built-in dialog. */
  onSaveToTrip?: (event: Event) => void | Promise<void>;
  /** Override the read-only "in trip" badge (otherwise pulled from useEntityTripStatus). */
  isInTrip?: boolean;
  attendStatus?: 'going' | 'interested' | 'not_going' | null;
  openDelayMs?: number;
}

/** Relative date label, e.g. "in 3 days" or "tonight". */
function relativeLabel(iso: string, t: (k: string, v?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const ms = new Date(iso).getTime() - now;
  const days = Math.round(ms / 86_400_000);
  const hours = Math.round(ms / 3_600_000);
  if (days < 0) return t('events.timeUntil.past', { defaultValue: 'past' });
  if (days === 0 && hours <= 1) return t('events.timeUntil.now', { defaultValue: 'happening now' });
  if (days === 0) return t('events.timeUntil.today', { defaultValue: 'today' });
  if (days === 1) return t('events.timeUntil.tomorrow', { defaultValue: 'tomorrow' });
  if (days < 7) return t('events.timeUntil.inDays', { count: days, defaultValue: `in ${days} days` });
  if (days < 30) return t('events.timeUntil.inWeeks', { count: Math.round(days / 7), defaultValue: `in ${Math.round(days / 7)} weeks` });
  if (days < 365) return t('events.timeUntil.inMonths', { count: Math.round(days / 30), defaultValue: `in ${Math.round(days / 30)} months` });
  return t('events.timeUntil.inYears', { count: Math.round(days / 365), defaultValue: `in ${Math.round(days / 365)} years` });
}

export function EventHoverCard({
  event,
  children,
  onRsvp,
  enableSaveToTrip,
  onSaveToTrip,
  isInTrip: isInTripProp,
  attendStatus,
  openDelayMs = 200,
}: EventHoverCardProps) {
  const { t } = useTranslation();
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const tripStatus = useEntityTripStatus('event', enableSaveToTrip ? event.id : undefined);
  const isInTrip = isInTripProp ?? tripStatus.data.isInTrip;
  const showSaveBtn = !!onSaveToTrip || !!enableSaveToTrip;

  const img = (event.images ?? []).find((u) => !!u);
  const dateRange = formatEventTime(
    event.start_date,
    event.end_date,
    (event as { timezone?: string | null }).timezone,
  );
  const location = [event.venue_name, event.city].filter(Boolean).join(', ');
  const tu = relativeLabel(event.start_date, t);
  // eslint-disable-next-line react-hooks/purity -- past/future check against current time; minute-level staleness is acceptable for a hover card label.
  const isPast = new Date(event.end_date ?? event.start_date).getTime() < Date.now();

  const handleRsvp = async (status: 'going' | 'interested') => {
    if (!onRsvp) return;
    setRsvpLoading(status);
    try {
      await onRsvp(event.id, status);
    } finally {
      setRsvpLoading(null);
    }
  };

  const handleSave = async () => {
    if (onSaveToTrip) {
      setSaveLoading(true);
      try {
        await onSaveToTrip(event);
      } finally {
        setSaveLoading(false);
      }
      return;
    }
    if (enableSaveToTrip) {
      setAddToTripOpen(true);
    }
  };

  return (
    <HoverCard openDelay={openDelayMs} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        sideOffset={8}
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-24px)] p-0 overflow-hidden"
      >
        <div className="flex gap-3 p-3">
          {img && (
            <Link to={`/events/${event.slug}`} className="shrink-0">
              <img
                src={img}
                alt=""
                loading="lazy"
                className="w-16 h-16 object-cover rounded-element border border-foreground/10"
              />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={`/events/${event.slug}`}
                className="text-sm font-medium leading-tight no-underline hover:underline line-clamp-2"
              >
                {event.title}
              </Link>
              {event.is_featured && (
                <Star
                  className="size-3 shrink-0 fill-foreground text-foreground mt-0.5"
                  aria-label={t('events.featured', 'Featured')}
                />
              )}
            </div>
            <p
              className={cn(
                'mt-1 text-xs2',
                isPast ? 'text-foreground/50' : 'text-foreground/80 font-medium',
              )}
            >
              {tu}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs2 text-foreground/70">
              <CalendarIcon className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{dateRange}</span>
            </p>
            {location && (
              <p className="mt-0.5 flex items-center gap-1 text-xs2 text-foreground/70">
                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </p>
            )}
          </div>
        </div>

        {event.description && (
          <p className="px-3 pb-2 text-xs2 text-foreground/80 line-clamp-3">{event.description}</p>
        )}

        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {event.event_type && (
            <Badge variant="outline" className="text-xs2 px-1.5 py-0">
              {event.event_type}
            </Badge>
          )}
          {event.is_free && (
            <Badge variant="secondary" className="text-xs2 px-1.5 py-0">
              <Ticket className="size-2.5 mr-1" aria-hidden="true" />
              {t('events.free', 'Free')}
            </Badge>
          )}
        </div>

        {(onRsvp || showSaveBtn) && (
          <div className="border-t border-foreground/10 px-2 py-2 flex items-center gap-1">
            {onRsvp && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={attendStatus === 'going' ? 'default' : 'outline'}
                  className="flex-1 h-7 text-xs2"
                  onClick={() => handleRsvp('going')}
                  disabled={!!rsvpLoading}
                  aria-pressed={attendStatus === 'going'}
                >
                  <Users className="size-3 mr-1" />
                  {t('events.rsvp.going', 'Going')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={attendStatus === 'interested' ? 'default' : 'outline'}
                  className="flex-1 h-7 text-xs2"
                  onClick={() => handleRsvp('interested')}
                  disabled={!!rsvpLoading}
                  aria-pressed={attendStatus === 'interested'}
                >
                  <Star className="size-3 mr-1" />
                  {t('events.rsvp.interested', 'Interested')}
                </Button>
              </>
            )}
            {showSaveBtn && (
              <Button
                type="button"
                size="sm"
                variant={isInTrip ? 'default' : 'outline'}
                className="h-7 text-xs2 px-2"
                onClick={handleSave}
                disabled={saveLoading}
                aria-pressed={isInTrip}
                aria-label={isInTrip ? t('events.removeFromTrip', 'Remove from trip') : t('events.saveToTrip', 'Save to trip')}
              >
                {isInTrip ? <Check className="size-3" /> : <Plus className="size-3" />}
              </Button>
            )}
          </div>
        )}
      </HoverCardContent>

      {enableSaveToTrip && !onSaveToTrip && (
        <AddToTripDialog
          open={addToTripOpen}
          onClose={() => setAddToTripOpen(false)}
          entity={{
            type: 'event',
            id: event.id,
            name: event.title,
            city_id: event.city_id ?? null,
            country_id: event.country_id ?? null,
            address: event.address ?? null,
            category: event.event_type ?? null,
          }}
        />
      )}
    </HoverCard>
  );
}
