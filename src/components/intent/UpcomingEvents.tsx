import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { EventDateBadge } from '@/components/transit/EventDateBadge';
import type { EventWindow, EventsWithFallback } from '@/hooks/useIntentData';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { isValidTimezone } from '@/utils/timezone';
import { formatEventPrice } from '@/lib/eventPrice';
import { stripHtmlTags } from '@/utils/htmlDecode';
import type { IntentEvent } from '@/hooks/useIntentData';

/** One-line blurb: the description's first line, else up to three tags. */
function eventBlurb(event: IntentEvent): string | null {
  const text = event.description
    ? stripHtmlTags(event.description).replace(/\s+/g, ' ').trim()
    : '';
  if (text) return text;
  const tags = (event.tags ?? []).filter(Boolean).slice(0, 3);
  return tags.length ? tags.join(' · ') : null;
}

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
  tonight: 'in the next 24 hours',
  'this-weekend': 'in the next 3 days',
  'next-7-days': 'in the next 7 days',
  'next-30-days': 'in the next 30 days',
  anywhere: 'soonest anywhere',
  selected: 'for the dates you picked',
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
  const { t, i18n } = useTranslation();
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
          : eventsResult?.window === 'selected'
            ? `Nothing is listed${cityName ? ` in ${cityName}` : ''} for the dates you picked.`
            : 'No upcoming events are listed yet.'}{' '}
        Our events coverage is thin: listings come from organisers and submissions, so an empty week
        here means we have no record, not that nothing is happening.
      </CoverageNote>
      {/* The date badge carries weekday, day and time; the row adds title,
          venue/type/price and a one-line blurb, so the date is never stated twice. */}
      {departuresBoard && events.length > 0 ? (
        <ul className="going-out-departures m-0 list-none p-0">
          {events.map((event) => {
            const timeZone =
              event.timezone && isValidTimezone(event.timezone) ? event.timezone : undefined;
            return (
              <li key={event.id} className="going-out-departure group relative">
                <EventDateBadge
                  startDate={event.start_date}
                  datePrecision={event.date_precision}
                  locale={i18n?.language}
                  timeZone={timeZone}
                  className="going-out-departure-date"
                />
                <span className="going-out-departure-main">
                  <span className="going-out-departure-title">{event.title}</span>
                  <EventMeta event={event} typeLabel={(v) => t(`eventTypes.${v}`, v)} />
                </span>
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
                <EventDateBadge
                  startDate={e.start_date}
                  datePrecision={e.date_precision}
                  locale={i18n?.language}
                  timeZone={e.timezone && isValidTimezone(e.timezone) ? e.timezone : undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title font-bold leading-tight">
                    {e.title}
                  </span>
                  {e.city && (
                    <span className="block truncate text-13 text-muted-foreground">{e.city}</span>
                  )}
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

function EventMeta({
  event,
  typeLabel,
}: {
  event: IntentEvent;
  typeLabel: (value: string) => string;
}) {
  // `other` carries no information, and a missing price is omitted rather
  // than printed as "TBA".
  const facts = [
    event.venue_name,
    event.event_type && event.event_type !== 'other' ? typeLabel(event.event_type) : null,
    formatEventPrice(event),
  ].filter(Boolean);
  const blurb = eventBlurb(event);
  if (facts.length === 0 && !blurb) return null;
  return (
    <>
      {facts.length > 0 ? (
        <span className="going-out-departure-meta">{facts.join(' · ')}</span>
      ) : null}
      {blurb ? <span className="going-out-departure-blurb">{blurb}</span> : null}
    </>
  );
}

export default UpcomingEvents;
