import type { NormalizedItem } from './source-adapter.ts'
import { parseLocation, htmlToText, firstUrl, type IcsEvent } from './ics-parse.ts'

// ============================================================
// rheinfetisch.de -> NormalizedItem
//
// Pure, so it can be unit-tested without importing the edge function — which
// calls Deno.serve() at module load and would bind a port inside the test run.
// The same split source-gaybasel and source-milchjugend use.
// ============================================================

/** See source-milchjugend for why `location` is widened separately. */
export type StagedItem = Omit<NormalizedItem, 'location'> &
  Record<string, unknown> & {
    location?: NonNullable<NormalizedItem['location']> & Record<string, unknown>
  }

export const CALENDAR_ID = 'rheinfetisch.nrw@gmail.com'
export const FEED = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`

/** Where a reader can see this calendar. Every row cites it as its source URL. */
export const CALENDAR_PAGE = 'https://www.rheinfetisch.de/kalender'

export const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)'

/**
 * Title -> `event_type`, defaulting to 'other'.
 *
 * source-gaybasel's rule is that a source with no taxonomy should write
 * 'other' rather than guess, and that is right when the guess would come from
 * a VENUE name — the venue-category pass turned 167 public toilets into cafés
 * and bars that way. This is the narrower case the rule still allows: these
 * are event titles whose words NAME the kind of event ("Dinner", "Workshop",
 * "Demonstration"), not a proper noun the reader has to interpret.
 *
 * It is kept deliberately small and literal. Anything not matched is 'other',
 * which the quality programme can improve later; nothing here infers a type
 * from the mere fact that the calendar belongs to a fetish club, because the
 * calendar also carries pride demos and a first-aid course.
 */
const TYPE_RULES: [RegExp, string][] = [
  [/\bdemonstration\b|\bdemo\b/i, 'protest'],
  [/\bpride\b|\bcsd\b/i, 'pride'],
  [/workshop|versammlung|delegierten|erster hilfe|diskussion|führung|vortrag|talk\b/i, 'community'],
  [/dinner|social\b|brunch|grillfest|bowling|minigolf|stammtisch|come-?together|meet ?& ?greet/i, 'social'],
  [/\bparty\b|colourcode|nachtschicht|anniversary/i, 'party'],
  [/fetisch|fetish|folsom|darklands|leather|leder|rubber|gummi|kink/i, 'fetish'],
  [/flohmarkt|markt\b/i, 'other'],
]

export function pickEventType(title: string): string {
  for (const [re, type] of TYPE_RULES) if (re.test(title)) return type
  return 'other'
}

/**
 * Fetch the published calendar.
 *
 * Google answers a calendar that is not public with 404 and an HTML body, so a
 * status check alone is not enough — a `text/html` 200 from an interstitial
 * would otherwise parse to zero events and report a clean, empty success.
 */
export async function fetchFeed(url = FEED): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/calendar' } })
  if (!res.ok) throw new Error(`rheinfetisch calendar ${res.status}`)
  const body = await res.text()
  if (!body.includes('BEGIN:VCALENDAR')) {
    throw new Error('rheinfetisch calendar: response is not an iCalendar document')
  }
  return body
}

export function normalizeIcsEvent(e: IcsEvent): StagedItem {
  const loc = parseLocation(e.location)
  const description = htmlToText(e.description)
  const link = firstUrl(e.description)
  const eventType = pickEventType(e.summary)

  const item: StagedItem = {
    entityType: 'event',
    sourceId: e.instanceKey,
    sourceName: 'rheinfetisch',
    name: e.summary,
    title: e.summary,
    description,
    event_type: eventType,
    start_date: e.start.iso,
    end_date: e.end?.iso,
    dates: { start: e.start.iso, end: e.end?.iso },
    // A venue name only when the LOCATION really named a place. parseLocation
    // refuses to hand back a "venue" that is just the city repeated, which is
    // the collision link_event_venues already measures at a 23% error rate on
    // its name-match branch.
    venue_name: loc.venueName,
    // The calendar entry itself carries no event page; a link in the prose is
    // usually the organiser's own page or a ticket shop.
    website: link,
    ticket_url: link && /ticket|shop|eventbrite|pretix/i.test(link) ? link : undefined,
    location: {
      address: loc.address,
      city: loc.city,
      postal_code: loc.postalCode,
      // Sent beside `city` on purpose: commit resolves the country first and
      // scopes its city lookup by it, so omitting it invites a same-name match.
      country: loc.countryCode,
      // Only when the feed NAMED a zone. Most entries are stamped in UTC with
      // no TZID, and there is no honest zone to attach — `run_event_timezone_fill`
      // derives it from the nearest city, which is better than a guess here.
      timezone: e.start.tzid,
    },
    images: [],
    tags: eventType === 'fetish' ? ['lgbtq', 'fetish'] : ['lgbtq'],
    // The contract requires a source URL. The calendar page is where a reader
    // can actually see this entry; the description link, when there is one,
    // is the organiser's page and is carried beside it.
    urls: link ? [CALENDAR_PAGE, link] : [CALENDAR_PAGE],
    metadata: {
      source: 'rheinfetisch',
      url: CALENDAR_PAGE,
      calendar_id: CALENDAR_ID,
      ics_uid: e.uid,
      // How the row was produced, so a reader can tell a collapsed festival
      // from a genuine monthly instance without re-reading the feed.
      ics_origin: e.origin,
      ics_rrule: e.rrule ?? null,
      ics_span_days: e.spanDays ?? null,
      all_day: e.start.allDay,
      raw_location: e.location ?? null,
    },
  }
  return item
}
