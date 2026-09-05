import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  osmPhone,
  osmVenueCategory,
  osmWebsite,
  parseOsmOpeningHours,
} from './osm-venue-fields.ts'

// ---------------------------------------------------------------------------
// opening_hours — the parser that actually earns its keep. A wrong opening time
// is a wasted journey across a city, so every ambiguous shape must return null
// rather than a best guess.
// ---------------------------------------------------------------------------

Deno.test('a plain weekday range expands to one slot per day', () => {
  const h = parseOsmOpeningHours('Mo-Fr 09:00-17:00')!
  assertEquals(h.regular.length, 5)
  assertEquals(h.regular[0], { day: 1, open: '0900', close: '1700' })
  assertEquals(h.regular[4], { day: 5, open: '0900', close: '1700' })
})

Deno.test('an overnight span marks close with + and carries past midnight', () => {
  // The bar case this corpus is full of: opens in the evening, shuts at 2am.
  const h = parseOsmOpeningHours('Mo-Th 17:00-02:00')!
  assertEquals(h.regular[0], { day: 1, open: '1700', close: '+0200' })
})

Deno.test('24:00 is end-of-day, not an overnight span', () => {
  const h = parseOsmOpeningHours('Sa 10:00-24:00')!
  // toMinutes('+0000') === 1440 in the consumer, which is exactly 24:00.
  assertEquals(h.regular[0], { day: 6, open: '1000', close: '+0000' })
})

Deno.test('24/7 fills every day', () => {
  const h = parseOsmOpeningHours('24/7')!
  assertEquals(h.regular.length, 7)
  assertEquals(new Set(h.regular.map((s) => s.day)).size, 7)
  assertEquals(h.regular[0], { day: 1, open: '0000', close: '2359' })
})

Deno.test('multiple rules and multiple ranges per rule both expand', () => {
  const h = parseOsmOpeningHours('Mo-Fr 12:00-14:00,18:00-23:00; Sa 18:00-02:00')!
  // 5 weekdays x 2 ranges + 1 Saturday
  assertEquals(h.regular.length, 11)
  assertEquals(h.regular.filter((s) => s.day === 6), [{ day: 6, open: '1800', close: '+0200' }])
})

Deno.test('a comma day list is not a range', () => {
  const h = parseOsmOpeningHours('Mo,We,Fr 20:00-23:00')!
  assertEquals(h.regular.map((s) => s.day), [1, 3, 5])
})

Deno.test('a wrapping day range is legal and wraps', () => {
  const h = parseOsmOpeningHours('Fr-Mo 22:00-23:00')!
  assertEquals(h.regular.map((s) => s.day), [1, 5, 6, 7])
})

Deno.test('PH off is skipped, and the real week survives it', () => {
  // Refusing the whole value here would throw away a correct weekly schedule
  // over an exception we merely cannot express.
  const h = parseOsmOpeningHours('Mo-Fr 09:00-17:00; PH off')!
  assertEquals(h.regular.length, 5)
})

Deno.test('an explicit day-off rule removes nothing but is accepted', () => {
  const h = parseOsmOpeningHours('Mo-Sa 10:00-18:00; Su off')!
  assertEquals(h.regular.length, 6)
  assertEquals(h.regular.some((s) => s.day === 7), false)
})

Deno.test('display is the raw OSM value, not a rewritten phrasing', () => {
  const raw = 'Mo-Fr 09:00-17:00; PH off'
  assertEquals(parseOsmOpeningHours(raw)!.display, raw)
})

Deno.test('open_now is never produced — it is stale the moment it is written', () => {
  const h = parseOsmOpeningHours('24/7')!
  assertEquals(Object.hasOwn(h, 'open_now'), false)
  assertEquals(Object.keys(h).sort(), ['display', 'regular'])
})

Deno.test('slots are sorted by day then opening time', () => {
  const h = parseOsmOpeningHours('Su 10:00-12:00; Mo 18:00-20:00; Mo 08:00-09:00')!
  assertEquals(h.regular.map((s) => `${s.day}:${s.open}`), ['1:0800', '1:1800', '7:1000'])
})

// --- everything below must REJECT THE WHOLE VALUE ---------------------------

Deno.test('seasonal, dated and solar selectors reject the entire value', () => {
  // Keeping the parseable half would publish "open" for a venue that is shut
  // for the season.
  for (
    const v of [
      'Apr-Oct Mo-Su 10:00-18:00',
      'Mo-Fr 09:00-17:00; Dec 25 off',
      '2026 Jan 01 off',
      'Mo-Fr sunrise-sunset',
      'week 1-20 Mo 10:00-12:00',
      'Mo[1] 10:00-12:00',
      'Mo-Fr 09:00-17:00 "ring the bell"',
      'Easter off',
    ]
  ) {
    assertEquals(parseOsmOpeningHours(v), null, `should have rejected: ${v}`)
  }
})

Deno.test('equal open and close is ambiguous and is rejected', () => {
  // 10:00-10:00 could mean a full 24 hours or a zero-length slot. Both readings
  // are defensible, which is exactly why it must not be guessed.
  assertEquals(parseOsmOpeningHours('Mo 10:00-10:00'), null)
})

Deno.test('unknown day tokens and malformed times are rejected', () => {
  for (
    const v of [
      'Mon-Fri 09:00-17:00', // three-letter days are not OSM syntax
      'Xx 10:00-12:00',
      'Mo 25:00-26:00',
      'Mo 10:60-12:00',
      'Mo 24:30-25:00',
      '10:00-12:00', // no day selector
      'Mo',
      'sometimes',
    ]
  ) {
    assertEquals(parseOsmOpeningHours(v), null, `should have rejected: ${v}`)
  }
})

Deno.test('empty and non-string inputs are null, never a throw', () => {
  for (const v of ['', '   ', null, undefined, 42, {}, []]) {
    assertEquals(parseOsmOpeningHours(v), null)
  }
})

// ---------------------------------------------------------------------------
// contacts
// ---------------------------------------------------------------------------

Deno.test('phone prefers contact:phone and takes the first of several', () => {
  assertEquals(osmPhone({ phone: '+41 44 111 22 33' }), '+41 44 111 22 33')
  assertEquals(
    osmPhone({ 'contact:phone': '+41 44 000 00 00', phone: '+41 44 111 22 33' }),
    '+41 44 000 00 00',
  )
  assertEquals(osmPhone({ phone: '+41 44 111 22 33;+41 44 444 55 66' }), '+41 44 111 22 33')
})

Deno.test('phone rejects vanity numbers and implausible digit counts', () => {
  assertEquals(osmPhone({ phone: '+1-800-FLOWERS' }), null)
  assertEquals(osmPhone({ phone: '12345' }), null)
  assertEquals(osmPhone({ phone: '1234567890123456789' }), null)
  assertEquals(osmPhone({}), null)
})

Deno.test('website upgrades a bare domain but never invents a non-http scheme', () => {
  assertEquals(osmWebsite({ website: 'https://example.org/' }), 'https://example.org/')
  assertEquals(osmWebsite({ website: 'example.org' }), 'https://example.org/')
  assertEquals(osmWebsite({ website: 'ftp://example.org' }), null)
  assertEquals(osmWebsite({ website: 'not a url' }), null)
  assertEquals(osmWebsite({}), null)
})

Deno.test('website prefers contact:website', () => {
  assertEquals(
    osmWebsite({ 'contact:website': 'https://a.example', website: 'https://b.example' }),
    'https://a.example/',
  )
})

// ---------------------------------------------------------------------------
// category — the safety-critical mapping
// ---------------------------------------------------------------------------

Deno.test('mundane physical types map', () => {
  assertEquals(osmVenueCategory({ amenity: 'bar' }), 'bar')
  assertEquals(osmVenueCategory({ amenity: 'pub' }), 'bar')
  assertEquals(osmVenueCategory({ amenity: 'nightclub' }), 'club')
  assertEquals(osmVenueCategory({ amenity: 'cafe' }), 'cafe')
  assertEquals(osmVenueCategory({ amenity: 'restaurant' }), 'restaurant')
  assertEquals(osmVenueCategory({ tourism: 'hotel' }), 'hotel')
  assertEquals(osmVenueCategory({ amenity: 'toilets' }), 'toilet')
  assertEquals(osmVenueCategory({ leisure: 'fitness_centre' }), 'gym')
})

Deno.test('a specific shop beats the generic shop fallback', () => {
  assertEquals(osmVenueCategory({ shop: 'hairdresser' }), 'salon')
  assertEquals(osmVenueCategory({ shop: 'books' }), 'shop')
  assertEquals(osmVenueCategory({ shop: 'no' }), null)
})

Deno.test('NO OSM tag may ever produce a queer-specific category', () => {
  // The whole point of the mapping table. `sauna` on this platform asserts a gay
  // sauna/bathhouse; OSM's is a hotel wellness room. `community_centre` here
  // reads as an LGBTQ+ centre. Inferring either from a generic tag makes a claim
  // about a business that nobody made.
  const forbidden = new Set(['sauna', 'cruising', 'community_center', 'event-venue', 'outdoor'])
  const probes: Record<string, string>[] = [
    { leisure: 'sauna' },
    { amenity: 'sauna' },
    { amenity: 'community_centre' },
    { amenity: 'social_centre' },
    { leisure: 'park' },
    { leisure: 'garden' },
    { leisure: 'beach_resort' },
    { natural: 'beach' },
    { amenity: 'events_venue' },
    { amenity: 'swingerclub' },
    { amenity: 'stripclub' },
    { amenity: 'brothel' },
    { shop: 'erotic' },
  ]
  for (const tags of probes) {
    const got = osmVenueCategory(tags)
    assertEquals(
      got === null || !forbidden.has(got),
      true,
      `${JSON.stringify(tags)} produced the queer-specific category ${got}`,
    )
  }
})

Deno.test('every mapped value is in the 17-value venue vocabulary', () => {
  // Drift guard. A value outside the DB CHECK aborts commit_venue_staging_item.
  const VENUE_CATEGORIES = new Set([
    'bar', 'club', 'cafe', 'restaurant', 'hotel', 'sauna', 'cruising', 'outdoor', 'shop',
    'community_center', 'event-venue', 'theater', 'gallery', 'salon', 'gym', 'toilet', 'other',
  ])
  const probes: Record<string, string>[] = [
    { amenity: 'bar' }, { amenity: 'pub' }, { amenity: 'biergarten' }, { amenity: 'nightclub' },
    { amenity: 'cafe' }, { amenity: 'restaurant' }, { amenity: 'fast_food' },
    { amenity: 'food_court' }, { amenity: 'ice_cream' }, { amenity: 'theatre' },
    { amenity: 'cinema' }, { amenity: 'arts_centre' }, { amenity: 'toilets' },
    { tourism: 'hotel' }, { tourism: 'hostel' }, { tourism: 'guest_house' },
    { tourism: 'motel' }, { tourism: 'apartment' }, { tourism: 'gallery' },
    { leisure: 'fitness_centre' }, { shop: 'hairdresser' }, { shop: 'beauty' },
    { shop: 'tattoo' }, { shop: 'clothes' },
  ]
  for (const tags of probes) {
    const got = osmVenueCategory(tags)
    assertEquals(got !== null && VENUE_CATEGORIES.has(got), true, `${JSON.stringify(tags)} -> ${got}`)
  }
})

Deno.test('an unmapped element yields null rather than other', () => {
  // `other` is the value we are trying to REPLACE. Returning it would look like
  // a successful classification and would stamp the row as done.
  assertEquals(osmVenueCategory({ building: 'yes' }), null)
  assertEquals(osmVenueCategory({}), null)
})
