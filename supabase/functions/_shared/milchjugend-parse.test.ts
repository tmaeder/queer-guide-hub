import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  cityOrPostal, cleanState, coord, occurrenceKey, parseEvent, parseVenue,
  pickEventType, resolveCountry, stripTags, toIso, venueKey,
} from './milchjugend-parse.ts'

// ────────────────────────────────────────────────────────────
// FIXTURES ARE REAL. Captured live from
// https://milchjugend.ch/wp-json/tribe/events/v1/events on 2026-08-22 and
// trimmed to the fields the parser reads — values are otherwise untouched.
//
// A hand-written fixture passes every test while matching 0% of live data,
// which is the failure this project has already paid for once.
// ────────────────────────────────────────────────────────────

/** A recurring occurrence: provisional id >= 10^7, date in the permalink. */
const RECURRING = {
  id: 10003380,
  title: 'Queerterthur Jugendtreff',
  url: 'https://milchjugend.ch/event/queerterthur-jugendtreff/2026-08-04/',
  start_date: '2026-08-04 17:00:00',
  end_date: '2026-08-04 21:00:00',
  utc_start_date: '2026-08-04 15:00:00',
  utc_end_date: '2026-08-04 19:00:00',
  timezone: 'Europe/Zurich',
  cost: 'gratis',
  website: 'https://www.jugendhaus-winti.ch',
  description: '<p>Der queere Jugendtreff ist für alle Jugendlichen von 13 bis 19 Jahren offen.</p>',
  image: { url: 'https://milchjugend.ch/wp-content/uploads/2026/03/queerterthur.png' },
  categories: [{ slug: 'jugendtreff', name: 'Jugendtreff' }],
  tags: [],
  venue: {
    id: 15127,
    venue: 'wilsch – queer Winterthur',
    address: 'Badgasse 8',
    city: 'Winterthur',
    stateprovince: 'Zürich',
    zip: '8405',
    country: 'Schweiz',
    geo_lat: 47.4992824,
    geo_lng: 8.7317892,
    website: 'https://wilsch.lgbt',
  },
}

/** A single event: real WP post id < 10^7, NO date in the permalink. */
const SINGLE = {
  id: 17503,
  title: 'Walk-In Transberatung',
  url: 'https://milchjugend.ch/event/walk-in-transberatung-2/',
  start_date: '2026-08-04 18:00:00',
  utc_start_date: '2026-08-04 16:00:00',
  timezone: 'Europe/Zurich',
  categories: [{ slug: 'beratung', name: 'Beratung' }],
  tags: [],
  venue: { id: 14758, venue: 'Opferhilfe beider Basel', city: 'Basel', stateprovince: 'Basel-Stadt', zip: '4051', country: 'Schweiz', geo_lat: 47.5556933, geo_lng: 7.5849643 },
}

/** Carries THREE traps at once: no `country` key, stateprovince === city, two categories. */
const MILCHBAR = {
  id: 10000105,
  title: 'Milchbar Baden',
  url: 'https://milchjugend.ch/event/milchbar-baden/2026-08-04/',
  start_date: '2026-08-04 19:00:00',
  end_date: '2026-08-04 23:30:00',
  utc_start_date: '2026-08-04 17:00:00',
  utc_end_date: '2026-08-04 21:30:00',
  timezone: 'Europe/Zurich',
  cost: 'gratis',
  website: '',
  description: '<p>Geniess einen schönen Abend an der Milchbar.</p>',
  image: { url: 'https://milchjugend.ch/wp-content/uploads/2024/08/Milchbar.jpeg' },
  categories: [{ slug: 'bar', name: 'Bar' }, { slug: 'jugendtreff', name: 'Jugendtreff' }],
  tags: [{ slug: 'milchbar', name: '#milchbar' }],
  venue: { id: 1762, venue: 'WERKK Baden', address: 'Schmiedestrasse', city: 'Baden', stateprovince: 'Baden', zip: '5400', geo_lat: 47.4799963, geo_lng: 8.3006636 },
}

// ── Identity: the load-bearing test in this file ─────────────
//
// milchjugend runs The Events Calendar PRO. Ids >= 10,000,000 are PROVISIONAL
// occurrence ids regenerated from `tec_occurrences` on any recurrence-rule edit.
// Keying on one re-inserts the whole corpus as new rows — the spartacus bug,
// which duplicated 47% of itself. 21 distinct titles cover 150 live events here,
// so the blast radius is the entire source.

Deno.test('occurrenceKey uses the permalink, never the provisional id', () => {
  const key = parseEvent(RECURRING)!.key
  assertEquals(key, 'queerterthur-jugendtreff:2026-08-04')
  assertNotEquals(key, String(RECURRING.id))
  // The id must not appear anywhere in the identity.
  assertEquals(key.includes('10003380'), false)
})

Deno.test('two occurrences of one series get distinct keys', () => {
  const a = occurrenceKey('https://milchjugend.ch/event/queerterthur-jugendtreff/2026-08-04/')
  const b = occurrenceKey('https://milchjugend.ch/event/queerterthur-jugendtreff/2026-08-25/')
  assertNotEquals(a, b)
  assertEquals([a, b], ['queerterthur-jugendtreff:2026-08-04', 'queerterthur-jugendtreff:2026-08-25'])
})

Deno.test('a single event keys on its slug alone, so rescheduling is an update', () => {
  assertEquals(occurrenceKey(SINGLE.url), 'walk-in-transberatung-2')
})

// Two sailings of the Pride Boat on 2026-05-22, 08:00 and 19:30 local. Both
// URLs are real. Dropping the sequence segment collides them onto one key and
// loses half the series; an earlier regex here dropped both rows outright.
Deno.test('two occurrences on the SAME DAY keep the sequence segment', () => {
  assertEquals(occurrenceKey('https://milchjugend.ch/event/pride-boat/2026-05-22/1/'), 'pride-boat:2026-05-22:1')
  assertEquals(occurrenceKey('https://milchjugend.ch/event/pride-boat/2026-05-22/2/'), 'pride-boat:2026-05-22:2')
  assertNotEquals(
    occurrenceKey('https://milchjugend.ch/event/kreuz-quer/2025-03-07/1/'),
    occurrenceKey('https://milchjugend.ch/event/kreuz-quer/2025-03-07/2/'),
  )
})

Deno.test('a same-day-sequence row parses rather than being dropped', () => {
  const e = parseEvent({
    ...RECURRING,
    url: 'https://milchjugend.ch/event/pride-boat/2026-05-22/2/',
    title: 'Pride Boat',
    utc_start_date: '2026-05-22 17:30:00',
  })
  assertEquals(e?.key, 'pride-boat:2026-05-22:2')
})

Deno.test('occurrenceKey tolerates a missing trailing slash, a query and a fragment', () => {
  assertEquals(occurrenceKey('https://milchjugend.ch/event/heldenbar/2026-09-01'), 'heldenbar:2026-09-01')
  assertEquals(occurrenceKey('https://milchjugend.ch/event/heldenbar/2026-09-01/?utm=x'), 'heldenbar:2026-09-01')
  assertEquals(occurrenceKey('https://milchjugend.ch/event/heldenbar/#map'), 'heldenbar')
})

Deno.test('occurrenceKey returns null for a non-event URL rather than a junk key', () => {
  assertEquals(occurrenceKey('https://milchjugend.ch/kalender/'), null)
  assertEquals(occurrenceKey(''), null)
  assertEquals(occurrenceKey(undefined), null)
})

// ── Time ─────────────────────────────────────────────────────

Deno.test('toIso prefers the API\'s own UTC field', () => {
  // 17:00 Europe/Zurich in August (CEST, +02:00) is 15:00Z — and the API says so.
  assertEquals(parseEvent(RECURRING)!.start, '2026-08-04T15:00:00.000Z')
  assertEquals(parseEvent(RECURRING)!.end, '2026-08-04T19:00:00.000Z')
})

Deno.test('toIso falls back to local+timezone, resolving the offset per instant', () => {
  // Same wall time, opposite sides of the DST boundary: +02:00 then +01:00.
  assertEquals(toIso(null, '2026-08-04 17:00:00', 'Europe/Zurich'), '2026-08-04T15:00:00.000Z')
  assertEquals(toIso(null, '2026-12-04 17:00:00', 'Europe/Zurich'), '2026-12-04T16:00:00.000Z')
})

Deno.test('toIso survives an unknown IANA zone instead of losing the event', () => {
  assertEquals(toIso(null, '2026-08-04 17:00:00', 'Mars/Olympus'), '2026-08-04T17:00:00.000Z')
})

Deno.test('toIso returns null when there is no usable time at all', () => {
  assertEquals(toIso(null, null, 'Europe/Zurich'), null)
  assertEquals(toIso('', 'not a date', 'Europe/Zurich'), null)
})

// ── Country: null is safe, wrong is not ──────────────────────

Deno.test('resolveCountry maps both spellings the API actually returns', () => {
  assertEquals(resolveCountry('Schweiz'), 'CH')
  assertEquals(resolveCountry('Switzerland'), 'CH')
})

Deno.test('resolveCountry falls back to the postal shape when country is absent', () => {
  // WERKK Baden carries no `country` key at all; 57 of 150 sampled are like this.
  assertEquals(parseEvent(MILCHBAR)!.venue!.country, 'CH')
})

Deno.test('resolveCountry returns null rather than guessing', () => {
  assertEquals(resolveCountry('Bayern'), null)
  assertEquals(resolveCountry(null, null, null), null)
})

// ── Field-shape traps observed live ──────────────────────────

Deno.test('cleanState drops a state that merely repeats the city', () => {
  // WERKK Baden: stateprovince "Baden" IS the city, not a canton.
  assertEquals(parseEvent(MILCHBAR)!.venue!.state, null)
  // A real canton survives.
  assertEquals(parseEvent(RECURRING)!.venue!.state, 'Zürich')
  assertEquals(cleanState('Zürich', 'Winterthur'), 'Zürich')
})

Deno.test('cityOrPostal reroutes a numeric city, which the CHECK constraint rejects', () => {
  assertEquals(cityOrPostal('8002'), { city: null, postal: '8002' })
  assertEquals(cityOrPostal('Basel'), { city: 'Basel', postal: null })
  assertEquals(cityOrPostal(''), { city: null, postal: null })
})

Deno.test('coord rejects the null island and unparseable values', () => {
  assertEquals(coord(47.4992824), 47.4992824)
  assertEquals(coord('8.7317892'), 8.7317892)
  assertEquals(coord(0), null)
  assertEquals(coord(''), null)
  assertEquals(coord(undefined), null)
})

Deno.test('venue coordinates are carried through — this is what clears W_NO_GEO', () => {
  const v = parseEvent(RECURRING)!.venue!
  assertEquals([v.lat, v.lng], [47.4992824, 8.7317892])
})

Deno.test('stripTags removes markup and decodes &amp; last', () => {
  assertEquals(stripTags('<p>Der queere <b>Jugendtreff</b></p>'), 'Der queere Jugendtreff')
  // Decoding &amp; first would turn this into real markup (js/double-escaping).
  assertEquals(stripTags('a &amp;lt;b&amp;gt; c'), 'a &lt;b&gt; c')
  assertEquals(stripTags('Fish &amp; Chips'), 'Fish & Chips')
})

Deno.test('an empty website string becomes null, not ""', () => {
  assertEquals(parseEvent(MILCHBAR)!.website, null)
  assertEquals(parseEvent(RECURRING)!.website, 'https://www.jugendhaus-winti.ch')
})

// ── event_type: anything unlisted is coerced to 'other' by trg_events_taxonomy ─

Deno.test('pickEventType prefers the event kind over the venue kind', () => {
  // Milchbar Baden is categorised [bar, jugendtreff]; "bar" describes the venue.
  assertEquals(parseEvent(MILCHBAR)!.eventType, 'community')
})

Deno.test('pickEventType maps every category slug observed live', () => {
  const seen: Record<string, string> = {
    jugendtreff: 'community', bar: 'social', party: 'party', drag: 'drag',
    film: 'film', festival: 'festival', outdoor: 'social', theater: 'theater',
    austausch: 'community', workshop: 'workshop', literatur: 'workshop',
    feiertag: 'other', pride: 'pride', tanz: 'party', beratung: 'community',
    sport: 'sports', bildung: 'workshop', essen: 'social',
  }
  for (const [slug, expected] of Object.entries(seen)) {
    assertEquals(pickEventType([slug]), expected, `${slug} should map to ${expected}`)
  }
})

Deno.test('pickEventType returns a value inside the events_event_type_check vocabulary', () => {
  const VOCAB = new Set([
    'accessibility', 'art', 'comedy', 'community', 'concert', 'conference', 'cruise',
    'drag', 'event', 'exhibition', 'fair', 'festival', 'fetish', 'film', 'fundraiser',
    'meetup', 'other', 'party', 'pride', 'protest', 'public', 'screening', 'social',
    'sports', 'theater', 'workshop',
  ])
  for (const slug of ['jugendtreff', 'bar', 'feiertag', 'unknown-slug', '']) {
    assertEquals(VOCAB.has(pickEventType([slug])), true, `${slug} produced a non-vocabulary type`)
  }
})

Deno.test('pickEventType falls back to other for an unmapped or empty set', () => {
  assertEquals(pickEventType([]), 'other')
  assertEquals(pickEventType(null), 'other')
  assertEquals(pickEventType(['brandneue-kategorie']), 'other')
})

// ── Venue identity ───────────────────────────────────────────

Deno.test('venueKey uses the venue\'s real WP post id', () => {
  assertEquals(venueKey(parseEvent(RECURRING)!.venue!), 'venue-15127')
  assertEquals(venueKey(parseEvent(MILCHBAR)!.venue!), 'venue-1762')
})

Deno.test('venueKey falls back to name|city when the id is missing', () => {
  const v = parseVenue({ venue: 'wilsch – queer Winterthur', city: 'Winterthur' })!
  assertEquals(venueKey(v), 'venue-wilsch-queer-winterthur|winterthur')
})

Deno.test('parseVenue returns null for the empty array Tribe sends when there is no venue', () => {
  assertEquals(parseVenue([]), null)
  assertEquals(parseVenue(null), null)
  assertEquals(parseVenue({ venue: '' }), null)
})

// ── Rejects: commit RAISEs on these, so drop them before staging ─

Deno.test('parseEvent returns null without a title or a start date', () => {
  assertEquals(parseEvent({ ...RECURRING, title: '' }), null)
  assertEquals(parseEvent({ ...RECURRING, utc_start_date: null, start_date: null }), null)
  assertEquals(parseEvent({ ...RECURRING, url: 'https://milchjugend.ch/kalender/' }), null)
})

Deno.test('parseEvent maps the whole real row end to end', () => {
  const e = parseEvent(RECURRING)!
  assertEquals(e.key, 'queerterthur-jugendtreff:2026-08-04')
  assertEquals(e.title, 'Queerterthur Jugendtreff')
  assertEquals(e.start, '2026-08-04T15:00:00.000Z')
  assertEquals(e.eventType, 'community')
  assertEquals(e.timezone, 'Europe/Zurich')
  assertEquals(e.cost, 'gratis')
  assertEquals(e.categories, ['jugendtreff'])
  assertEquals(e.image, 'https://milchjugend.ch/wp-content/uploads/2026/03/queerterthur.png')
  assertEquals(e.description?.startsWith('Der queere Jugendtreff'), true)
  assertEquals(e.venue!.name, 'wilsch – queer Winterthur')
  assertEquals(e.venue!.city, 'Winterthur')
  assertEquals(e.venue!.postal, '8405')
  assertEquals(e.venue!.country, 'CH')
})

Deno.test('tags come through as slugs', () => {
  assertEquals(parseEvent(MILCHBAR)!.tags, ['milchbar'])
  assertEquals(parseEvent(RECURRING)!.tags, [])
})
