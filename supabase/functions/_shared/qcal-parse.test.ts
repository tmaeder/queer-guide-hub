import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { normalizeQcalEvent, normalizeQcalPage, type QcalRaw } from './qcal-parse.ts'

// Every fixture below is a real /api/events/search item captured 2026-09-28,
// trimmed to the fields under test. Synthetic fixtures are how a parser passes
// its own tests and fails the live payload.

const TICK: QcalRaw = {
  _id: '6aa46e99468e1a1b260b5956',
  title: 'Tick Tick Boom at Diversionary Theater',
  status: 'published',
  attendanceMode: 'in-person',
  slug: 'tick-tick-boom-at-diversionary-theater-san-diego-ca-us',
  timezone: 'America/Los_Angeles',
  imagePath: '/assets/2026/09/11/afcdbc39-8de2-472c-9d58-9aa97fbc3e53.jpg',
  nextStart: '2026-09-28T02:00:00.000Z',
  nextEnd: '2026-09-28T22:30:00.000Z',
  cardLine: 'Sep 26th – Sep 27th • 7 PM to 3:30 PM',
  hosts: [{ name: 'Niche Media', slug: 'niche-media' }],
  locations: [{
    full_address: '4545 Park Blvd #101, San Diego, CA 92116, USA',
    geo: { type: 'Point', coordinates: [-117.14589869999999, 32.759983] },
    address: { house_number: '4545', road: 'Park Blvd', city: 'San Diego', state: 'CA', postcode: '92116', country: 'US' },
  }],
}

const ONLINE: QcalRaw = {
  title: 'Virtual Reading & Conversation with Author Alex Sanchez',
  status: 'published',
  attendanceMode: 'online',
  slug: 'virtual-reading-alex-sanchez',
  nextStart: '2026-10-05T18:00:00.000Z',
  locations: [{
    full_address: 'Fort Lauderdale, FL, USA',
    geo: { type: 'Point', coordinates: [-80.13731740000001, 26.1224386] },
    address: { house_number: '', road: '', city: 'Fort Lauderdale', state: 'FL', postcode: '', country: 'US' },
  }],
}

Deno.test('qcal: maps a full in-person event', () => {
  const e = normalizeQcalEvent(TICK)!
  assertEquals(e.slug, 'tick-tick-boom-at-diversionary-theater-san-diego-ca-us')
  assertEquals(e.title, 'Tick Tick Boom at Diversionary Theater')
  assertEquals(e.url, 'https://qcal.app/event/tick-tick-boom-at-diversionary-theater-san-diego-ca-us')
  assertEquals(e.start, '2026-09-28T02:00:00.000Z')
  assertEquals(e.end, '2026-09-28T22:30:00.000Z')
  assertEquals(e.timezone, 'America/Los_Angeles')
  assertEquals(e.city, 'San Diego')
  assertEquals(e.country, 'US')
  assertEquals(e.state, 'CA')
  assertEquals(e.postal, '92116')
  assertEquals(e.host, 'Niche Media')
  assertEquals(e.image, 'https://qcal.app/assets/2026/09/11/afcdbc39-8de2-472c-9d58-9aa97fbc3e53.jpg')
})

Deno.test('qcal: GeoJSON is [lng, lat] and is NOT emitted swapped', () => {
  const e = normalizeQcalEvent(TICK)!
  // San Diego. A swap would give lat -117.1, which is not a latitude at all —
  // and for a European event a swap lands inside the legal range and is
  // therefore invisible to the write contract.
  assertEquals(e.lat, 32.759983)
  assertEquals(e.lng, -117.14589869999999)
})

Deno.test('qcal: address is the STREET only, never the composite full_address', () => {
  // full_address repeats city/state/postcode/country, all of which already
  // have their own columns; commit writes location.address into events.address.
  assertEquals(normalizeQcalEvent(TICK)!.address, '4545 Park Blvd')
})

Deno.test('qcal: an empty house_number/road yields null, not a stray space', () => {
  assertEquals(normalizeQcalEvent(ONLINE)!.address, null)
})

Deno.test('qcal: venue_name is always null — a host is not a venue', () => {
  // Feeding an organiser name to the event->venue linker is the documented
  // place-collision failure. This must stay null even though hosts[0] exists.
  assertEquals(normalizeQcalEvent(TICK)!.venueName, null)
})

Deno.test('qcal: online events still keep their city', () => {
  const e = normalizeQcalEvent(ONLINE)!
  assertEquals(e.online, true)
  assertEquals(e.city, 'Fort Lauderdale')
})

Deno.test('qcal: drops rows the commit RPC would hard-reject anyway', () => {
  assertEquals(normalizeQcalEvent({ ...TICK, nextStart: undefined }), null)
  assertEquals(normalizeQcalEvent({ ...TICK, nextStart: '   ' }), null)
  assertEquals(normalizeQcalEvent({ ...TICK, title: '' }), null)
  assertEquals(normalizeQcalEvent({ ...TICK, slug: undefined }), null)
})

Deno.test('qcal: an unpublished row is dropped', () => {
  assertEquals(normalizeQcalEvent({ ...TICK, status: 'draft' }), null)
})

Deno.test('qcal: an end before its start is dropped, the event is kept', () => {
  // E_DATE_ORDER_INVALID would otherwise stage a row carrying a known defect.
  const e = normalizeQcalEvent({ ...TICK, nextEnd: '2026-09-27T00:00:00.000Z' })!
  assertEquals(e.start, '2026-09-28T02:00:00.000Z')
  assertEquals(e.end, null)
})

Deno.test('qcal: null island is not a location', () => {
  const e = normalizeQcalEvent({
    ...TICK,
    locations: [{ geo: { type: 'Point', coordinates: [0, 0] }, address: { city: 'Nowhere' } }],
  })!
  assertEquals(e.lat, null)
  assertEquals(e.lng, null)
  assertEquals(e.city, 'Nowhere')
})

Deno.test('qcal: a missing or malformed geo is null on BOTH axes', () => {
  // E_GEO_PARTIAL fires when exactly one of lat/lng is set, so a half-parse
  // is worse than none.
  for (const coords of [undefined, [], [1], ['a', 'b'] as unknown as number[]]) {
    const e = normalizeQcalEvent({
      ...TICK,
      locations: [{ geo: { coordinates: coords as number[] }, address: { city: 'X' } }],
    })!
    assertEquals(e.lat, null)
    assertEquals(e.lng, null)
  }
  const noLoc = normalizeQcalEvent({ ...TICK, locations: [] })!
  assertEquals(noLoc.lat, null)
  assertEquals(noLoc.lng, null)
  assertEquals(noLoc.city, null)
})

Deno.test('qcal: event_type comes from the shared ladder and is on-vocabulary', () => {
  const LEGAL = new Set([
    'party', 'festival', 'pride', 'fetish', 'community', 'meetup', 'conference',
    'workshop', 'concert', 'film', 'drag', 'sports', 'art', 'theater',
    'fundraiser', 'protest', 'social', 'fair', 'cruise', 'comedy', 'exhibition', 'other',
  ])
  assertEquals(LEGAL.has(normalizeQcalEvent(TICK)!.eventType), true)
  assertEquals(normalizeQcalEvent({ ...TICK, title: 'Denver Pride Parade' })!.eventType, 'pride')
  assertEquals(normalizeQcalEvent({ ...TICK, title: 'Leather & Rubber Night' })!.eventType, 'fetish')
})

Deno.test('qcal: recurring instances collapse to ONE event, keeping the earliest', () => {
  // Live shape: 261 API rows are 51 events; sisters-bingo alone is 54 rows,
  // each with its own nextStart, and the feed is ascending. Keeping the first
  // occurrence must therefore keep the next upcoming instance.
  const inst = (start: string): QcalRaw => ({ ...TICK, slug: 'weekly-bingo', nextStart: start, nextEnd: undefined })
  const out = normalizeQcalPage([
    inst('2026-10-11T01:00:00.000Z'),
    inst('2026-10-25T01:00:00.000Z'),
    inst('2026-11-15T02:00:00.000Z'),
  ])
  assertEquals(out.length, 1)
  assertEquals(out[0].start, '2026-10-11T01:00:00.000Z')
})

Deno.test('qcal: a page dedupes by slug and preserves order', () => {
  const out = normalizeQcalPage([TICK, ONLINE, TICK])
  assertEquals(out.length, 2)
  assertEquals(out[0].slug, TICK.slug)
  assertEquals(out[1].slug, ONLINE.slug)
})

Deno.test('qcal: an all-invalid page yields an empty array, not a throw', () => {
  assertEquals(normalizeQcalPage([{}, { title: 'x' }, { slug: 'y' }]).length, 0)
})
