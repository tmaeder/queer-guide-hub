import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { RouteBullet } from '@/components/transit/RouteBullet';
import type { EventWindow, EventsWithFallback } from '@/hooks/useIntentData';
import { cn } from '@/lib/utils';

/**
 * The "What's on" body, shared by /going-out and /people.
 *
 * These two pages carried this block — the window sentence, the coverage note
 * and the event list — copy-pasted verbatim, along with WINDOW_LABEL. The
 * copies had already drifted apart cosmetically (class order, one had an extra
 * kicker), which is how this class of duplication announces itself before it
 * drifts semantically: the day someone fixes the coverage wording on one page,
 * the other keeps the old claim.
 *
 * Only the BODY is shared. Section label, kicker and action stay with the
 * caller, because the two pages legitimately frame it differently — /going-out
 * says "What's on", /people says "Turning up somewhere beats messaging".
 */

// Not exported: both callers now render <UpcomingEvents/> rather than
// building the sentence themselves, so this has exactly one consumer.
const WINDOW_LABEL: Record<EventWindow, string> = {
  tonight: 'tonight',
  'this-weekend': 'this weekend',
  'next-7-days': 'in the next 7 days',
  'next-30-days': 'in the next 30 days',
  anywhere: 'soonest anywhere',
};

export function UpcomingEvents({
  eventsResult,
  cityName,
  variant = 'default',
  borderless = false,
}: {
  eventsResult: EventsWithFallback | undefined;
  cityName?: string | null;
  variant?: 'default' | 'going-out';
  borderless?: boolean;
}) {
  const events = eventsResult?.events ?? [];
  const departuresBoard = variant === 'going-out';

  return (
    <div className={departuresBoard ? 'going-out-events' : undefined}>
      <CoverageNote>
        {events.length > 0
          ? `Showing events ${WINDOW_LABEL[eventsResult!.window]}${
              eventsResult!.window === 'anywhere' && cityName
                ? ` — nothing is listed in ${cityName} in the next 30 days.`
                : '.'
            }`
          : 'No upcoming events are listed yet.'}{' '}
        Our events coverage is thin: listings come from organisers and submissions, so an empty week
        here means we have no record, not that nothing is happening.
      </CoverageNote>
      {/* The event route bullet identifies each stop; dates and city labels
          remain visible at mobile widths, and tonal rows separate entries. */}
      {departuresBoard && events.length > 0 ? (
        <ul className="going-out-departures m-0 list-none p-0">
          {events.map((event) => {
            const startsAt = new Date(event.start_date);
            return (
              <li key={event.id} className="going-out-departure group relative">
                <span className="going-out-departure-bullet">
                  <RouteBullet type="event" size={34} />
                </span>
                <span className="going-out-departure-date tabular-nums">
                  <strong>{startsAt.toLocaleDateString(undefined, { day: '2-digit' })}</strong>
                  <span>{startsAt.toLocaleDateString(undefined, { month: 'short' })}</span>
                </span>
                <span className="going-out-departure-title">{event.title}</span>
                <span className="going-out-departure-city">
                  {event.city ?? 'Destination to be confirmed'}
                </span>
                {event.slug ? (
                  <LocalizedLink
                    to={`/events/${event.slug}`}
                    aria-label={event.title}
                    className="absolute inset-0 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-track-pink"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : events.length > 0 ? (
        <ul
          className={cn(
            'm-0 list-none p-0',
            borderless ? 'space-y-2' : 'rounded-container bg-card shadow-soft',
          )}
        >
          {events.map((e) => (
            <li
              key={e.id}
              className={cn(
                'group relative',
                borderless
                  ? 'rounded-element bg-card shadow-soft'
                  : 'border-b border-border-hairline last:border-b-0',
              )}
            >
              <div className="flex items-center gap-4 px-4 py-4 transition-colors group-hover:bg-surface-container">
                <RouteBullet type="event" size={34} />
                <span className="min-w-0 flex-1 truncate text-title font-bold leading-tight">
                  {e.title}
                </span>
                <span className="shrink-0 whitespace-nowrap text-13 tabular-nums text-muted-foreground">
                  {new Date(e.start_date).toLocaleDateString()}
                  {e.city ? ` · ${e.city}` : ''}
                </span>
              </div>
              {e.slug ? (
                <LocalizedLink
                  to={`/events/${e.slug}`}
                  aria-label={e.title}
                  className="absolute inset-0 no-underline"
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default UpcomingEvents;
