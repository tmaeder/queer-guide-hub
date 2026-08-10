import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { CoverageNote } from '@/components/intent/CoverageNote';
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
      {events.length > 0 ? (
        <ul className="list-none p-0 m-0">
          {events.map((e) => (
            <li key={e.id} className="border-b border-border py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">
                  {e.slug ? (
                    <LocalizedLink to={`/events/${e.slug}`} className="no-underline hover:underline">
                      {e.title}
                    </LocalizedLink>
                  ) : (
                    e.title
                  )}
                </span>
                <span className="text-13 text-muted-foreground whitespace-nowrap">
                  {new Date(e.start_date).toLocaleDateString()}
                  {e.city ? ` · ${e.city}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default UpcomingEvents;
