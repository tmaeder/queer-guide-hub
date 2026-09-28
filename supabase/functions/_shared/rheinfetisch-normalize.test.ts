import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { pickEventType, normalizeIcsEvent } from './rheinfetisch-normalize.ts'
import { parseIcs, type IcsEvent } from './ics-parse.ts'
import { validateEventSourceContract } from './event-source-contract.ts'

const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`

const oneEvent = (props: string): IcsEvent =>
  parseIcs(ics(`BEGIN:VEVENT\r\nUID:t@google.com\r\n${props}\r\nEND:VEVENT`)).events[0]

// ------------------------------------------------------------
// event_type
// ------------------------------------------------------------

Deno.test('pickEventType maps the kinds this calendar actually names', () => {
  // Every title below is verbatim from the live feed.
  assertEquals(pickEventType('Rheinfetisch Dinner'), 'social')
  assertEquals(pickEventType('Rheinfetisch Social @ Folsom Europe'), 'social')
  assertEquals(pickEventType('Rheinfetisch Activity | Bowling'), 'social')
  assertEquals(pickEventType('CSD Köln Demonstration'), 'protest')
  assertEquals(pickEventType('CSD Düsseldorf'), 'pride')
  assertEquals(pickEventType('Cologne Fetish Pride 2026'), 'pride')
  assertEquals(pickEventType('CFP2025 | Workshop Latex'), 'community')
  assertEquals(pickEventType('Rheinfetisch Mitgliederversammlung'), 'community')
  assertEquals(pickEventType('Fit in Erster Hilfe by Rheinfetisch'), 'community')
  assertEquals(pickEventType('CFP2026 | COLOURcode'), 'party')
  assertEquals(pickEventType('Darklands'), 'fetish')
  assertEquals(pickEventType('Folsom Europe'), 'fetish')
})

Deno.test('a demonstration is a protest even though its title says CSD', () => {
  // Rule order is load-bearing: `pride` would otherwise swallow the demo.
  assertEquals(pickEventType('CSD Köln Demonstration'), 'protest')
  assertEquals(pickEventType('CSD Düsseldorf Demonstration'), 'protest')
})

Deno.test('an unrecognised title is other, never a guess from the calendar owner', () => {
  // The calendar belongs to a fetish club, which is not evidence about a
  // particular entry — it also carries pride demos and a first-aid course.
  assertEquals(pickEventType('Namen und Steine'), 'other')
  assertEquals(pickEventType('Deine Sitzung 2026: Helvetia Helau!'), 'other')
  assertEquals(pickEventType('Come-Together-Cup'), 'social')
})

// ------------------------------------------------------------
// normalize
// ------------------------------------------------------------

Deno.test('a fully specified event normalizes to the shape commit reads', () => {
  const e = oneEvent(
    'SUMMARY:Rheinfetisch Dinner\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260925T190000\r\n' +
    'DTEND;TZID=Europe/Berlin:20260925T230000\r\n' +
    'LOCATION:Meson El Cordobes\\, Gladbacher Str. 11\\, 50672 Köln\\, Deutschland\r\n' +
    'DESCRIPTION:Anmeldung unter <a href="https://tickets.rheinfetisch.de/RF/260925a/">hier</a>',
  )
  const n = normalizeIcsEvent(e)
  assertEquals(n.title, 'Rheinfetisch Dinner')
  assertEquals(n.event_type, 'social')
  assertEquals(n.start_date, '2026-09-25T17:00:00.000Z')
  assertEquals(n.end_date, '2026-09-25T21:00:00.000Z')
  assertEquals(n.venue_name, 'Meson El Cordobes')
  const loc = n.location!
  assertEquals(loc.address, 'Gladbacher Str. 11')
  assertEquals(loc.city, 'Köln')
  assertEquals(loc.postal_code, '50672')
  assertEquals(loc.country, 'DE')
  assertEquals(loc.timezone, 'Europe/Berlin')
  assertEquals(n.ticket_url, 'https://tickets.rheinfetisch.de/RF/260925a/')
})

Deno.test('venue_name is unset when LOCATION only repeated the city', () => {
  const e = oneEvent(
    'SUMMARY:LCNW Kohl- und Pinkelfahrt\r\nDTSTART;VALUE=DATE:20250124\r\n' +
    'LOCATION:Bremen\\, 28 Bremen\\, Deutschland',
  )
  const n = normalizeIcsEvent(e)
  assertEquals(n.venue_name, undefined)
  assertEquals((n.location as Record<string, unknown>).city, 'Bremen')
})

Deno.test('timezone is omitted when the feed stamped the event in UTC', () => {
  // Nothing in a `...Z` value says which zone to display it in, and
  // run_event_timezone_fill derives that from the nearest city instead.
  const e = oneEvent('SUMMARY:Rheinfetisch Sommer Grillfest\r\nDTSTART:20260726T130000Z')
  const n = normalizeIcsEvent(e)
  assertEquals((n.location as Record<string, unknown>).timezone, undefined)
})

Deno.test('a non-ticket link becomes the website and not the ticket url', () => {
  const e = oneEvent(
    'SUMMARY:NLC Christkindlesmarkt Treffen 2026\r\nDTSTART;VALUE=DATE:20261127\r\n' +
    'DESCRIPTION:<a href="https://nlc-nuernberg.de/programm/">Programm</a>',
  )
  const n = normalizeIcsEvent(e)
  assertEquals(n.website, 'https://nlc-nuernberg.de/programm/')
  assertEquals(n.ticket_url, undefined)
})

Deno.test('the fetish tag is only added when the type resolved to fetish', () => {
  const fetish = normalizeIcsEvent(oneEvent('SUMMARY:Darklands\r\nDTSTART;VALUE=DATE:20260303'))
  assertEquals(fetish.tags, ['lgbtq', 'fetish'])
  // A pride demo on a fetish club's calendar is not a fetish event.
  const demo = normalizeIcsEvent(oneEvent('SUMMARY:CSD Köln Demonstration\r\nDTSTART:20260705T093000Z'))
  assertEquals(demo.tags, ['lgbtq'])
})

Deno.test('metadata records HOW the row was produced', () => {
  const span = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:f@google.com\r\nSUMMARY:Folsom Europe\r\n' +
    'DTSTART;VALUE=DATE:20260909\r\nDTEND;VALUE=DATE:20260910\r\n' +
    'RRULE:FREQ=DAILY;UNTIL=20260913\r\nEND:VEVENT',
  )).events[0]
  const meta = normalizeIcsEvent(span).metadata as Record<string, unknown>
  assertEquals(meta.ics_origin, 'span')
  assertEquals(meta.ics_span_days, 5)
  assertEquals(meta.ics_rrule, 'FREQ=DAILY;UNTIL=20260913')
  assertEquals(meta.ics_uid, 'f@google.com')
})

Deno.test('the source id is the stable instance key, so a re-read is idempotent', () => {
  const doc = ics(
    'BEGIN:VEVENT\r\nUID:s@google.com\r\nSUMMARY:Rheinfetisch Social\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260114T190000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=2WE\r\nEND:VEVENT',
  )
  const first = parseIcs(doc).events.map((e) => normalizeIcsEvent(e).sourceId)
  const second = parseIcs(doc).events.map((e) => normalizeIcsEvent(e).sourceId)
  assertEquals(first, second)
  assertEquals(new Set(first).size, 3)
  assertEquals(first[0], 's@google.com::20260114')
})

// ------------------------------------------------------------
// The write-time contract — what actually blocks a row from staging
// ------------------------------------------------------------

Deno.test('every shape in this feed clears the event source contract', () => {
  const shapes = [
    // Timed, fully addressed.
    'SUMMARY:Rheinfetisch Dinner\r\nDTSTART;TZID=Europe/Berlin:20260925T190000\r\n' +
      'DTEND;TZID=Europe/Berlin:20260925T230000\r\nLOCATION:Meson\\, Gladbacher Str. 11\\, 50672 Köln\\, Deutschland\r\n' +
      'DESCRIPTION:Ein gemeinsames Abendessen in netter Runde mit Freunden und Mitgliedern.',
    // All-day, city only.
    'SUMMARY:Folsom Europe\r\nDTSTART;VALUE=DATE:20260909\r\nDTEND;VALUE=DATE:20260910\r\n' +
      'LOCATION:Berlin\\, Deutschland',
    // UTC stamp, no location at all.
    'SUMMARY:Rheinfetisch Activity: Photoshoot\r\nDTSTART:20260816T120000Z\r\nDTEND:20260816T150000Z',
    // No DTEND.
    'SUMMARY:Fetisch Flohmarkt\r\nDTSTART:20261114T140000Z',
  ]
  for (const s of shapes) {
    const n = normalizeIcsEvent(oneEvent(s))
    const { errors } = validateEventSourceContract(n)
    assertEquals(errors, [], `contract errors for ${n.name}: ${errors.join(', ')}`)
  }
})

Deno.test('the contract is satisfied by a real source URL, not an invented one', () => {
  const n = normalizeIcsEvent(oneEvent('SUMMARY:Fetisch Flohmarkt\r\nDTSTART:20261114T140000Z'))
  assertEquals(n.urls, ['https://www.rheinfetisch.de/kalender'])
  assertEquals(validateEventSourceContract(n).errors, [])
})

Deno.test('a start with no usable offset never reaches staging as a timezone error', () => {
  // A floating DTSTART is refused by the parser, so no undated row is built.
  assertEquals(
    parseIcs(ics('BEGIN:VEVENT\r\nUID:f2@google.com\r\nSUMMARY:Floating\r\nDTSTART:20260114T190000\r\nEND:VEVENT')).events.length,
    0,
  )
})

Deno.test('an all-day span keeps start <= end after the inclusive conversion', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:sp@google.com\r\nSUMMARY:Maspalomas Fetish Pride\r\n' +
    'DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002\r\n' +
    'RRULE:FREQ=DAILY;UNTIL=20261012\r\nEND:VEVENT',
  ))
  const n = normalizeIcsEvent(events[0])
  assertEquals(n.start_date, '2026-10-01')
  assertEquals(n.end_date, '2026-10-12')
  assertEquals(validateEventSourceContract(n).errors, [])
})

Deno.test('a description shorter than the contract bar warns but does not block', () => {
  const n = normalizeIcsEvent(oneEvent('SUMMARY:Nachtschicht\r\nDTSTART:20261024T190000Z\r\nDESCRIPTION:Kurz'))
  const { errors, warnings } = validateEventSourceContract(n)
  assertEquals(errors, [])
  assert(warnings.includes('W_DESCRIPTION_MISSING_OR_THIN'))
})
