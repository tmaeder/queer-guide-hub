import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { RouteBullet } from '@/components/transit/RouteBullet';
import type { EventWindow, EventsWithFallback } from '@/hooks/useIntentData';

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
}: {
  eventsResult: EventsWithFallback | undefined;
  cityName?: string | null;
}) {
  const events = eventsResult?.events ?? [];

  return (
    <div>
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
      {/* A departures board: one ink frame, hairline rules between rows, the
          event bullet leading each. Follows the homepage DeparturesBoard rather
          than the standalone `DepartureRow` primitive, whose own 2px border
          would double against its neighbour's in a stack. */}
      {events.length > 0 ? (
        <ul className="m-0 list-none bg-card p-0 rounded-container shadow-soft">
          {events.map((e) => (
            <li key={e.id} className="group relative border-b border-foreground/10 last:border-b-0">
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
