import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { ContentLangBadge } from '@/components/i18n/ContentLangBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, Clock, Users } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { upcomingVenueEvents } from '@/lib/venueEvents';

type Event = Database['public']['Tables']['events']['Row'];

interface VenueEventsProps {
  venueId: string;
  venueName: string;
  events: Event[];
  /** Initial number shown; the rest open in place. */
  preview?: number;
  now?: Date;
}

/**
 * The next few events, then "Show all N" in place. It printed ten full rows
 * under its own card heading, inside a section already titled "What's on
 * here", which made the tail of a venue page longer than its visiting facts.
 * There is no events-by-venue listing to link to, so the rest expand here.
 */
export function VenueEvents({ venueId, events, preview = 3, now }: VenueEventsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const upcoming = upcomingVenueEvents(events, venueId, now);
  if (upcoming.length === 0) return null;
  const shown = expanded ? upcoming : upcoming.slice(0, preview);

  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((event) => (
          <li
            key={event.id}
            className="flex items-center justify-between gap-4 rounded-element bg-muted p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {event.title}
                <ContentLangBadge
                  text={event.title}
                  language={(event as { content_language?: string | null }).content_language}
                />
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1 text-sm">
                  <Calendar size={12} aria-hidden="true" />
                  {format(new Date(event.start_date), 'MMM d, yyyy')}
                </span>
                <span className="flex items-center gap-1 text-sm">
                  <Clock size={12} aria-hidden="true" />
                  {format(new Date(event.start_date), 'h:mm a')}
                </span>
                {event.max_attendees && (
                  <span className="flex items-center gap-1 text-sm">
                    <Users size={12} aria-hidden="true" />
                    {t('venues.events.max', 'Max {{count}}', { count: event.max_attendees })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {event.event_type && <Badge variant="outline">{event.event_type}</Badge>}
              {/* No price on record: say nothing rather than "Price TBA". */}
              {event.is_free ? (
                <Badge variant="outline">{t('venues.events.free', 'Free')}</Badge>
              ) : event.price_min ? (
                <span className="text-sm font-medium">
                  {formatCurrency(event.price_min, event.currency)}
                </span>
              ) : null}
              {/* asChild rather than wrapping the Button in a link: a <button>
                  inside an <a> is the nested-interactive violation. */}
              <Button size="icon" variant="outline" asChild>
                <LocalizedLink
                  to={`/events/${event.slug || event.id}`}
                  aria-label={t('venues.events.details', 'Details: {{title}}', {
                    title: event.title,
                  })}
                  className="no-underline"
                >
                  <ArrowRight className="rtl:rotate-180" aria-hidden />
                </LocalizedLink>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {upcoming.length > preview && (
        <Button
          variant="outline"
          className="self-start"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t('venues.events.showFewer', 'Show fewer events')
            : t('venues.events.showAll', 'Show all {{count}} upcoming events', {
                count: upcoming.length,
              })}
        </Button>
      )}
    </div>
  );
}
