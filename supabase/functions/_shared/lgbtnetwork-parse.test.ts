import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { epochPair, parseEvent, parseUsAddress, repairJsonLdDate } from './lgbtnetwork-parse.ts'

// ────────────────────────────────────────────────────────────
// Fixtures are REAL, captured from lgbtnetwork.org on 2026-08-22. The
// distributions cited come from 66-138 event pages sampled across the corpus.
// ────────────────────────────────────────────────────────────

const LD = {
  '@type': 'Event',
  name: 'Thrive Social Series @ Kween Astoria',
  startDate: '2026-9-30T18:00-4:00',
  endDate: '2026-9-30T20:00-4:00',
  location: [{
    '@type': 'Place',
    name: 'Kween',
    address: { '@type': 'PostalAddress', streetAddress: '34-10 30th Ave., Astoria, NY 11103' },
  }],
}

const page = (ld: unknown, dataTime = 'data-time="1790805600-1790812800"') =>
  `<html><body><span ${dataTime}></span><script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`

const ROW = { id: 35419, slug: 'thrive-social-series-kween-astoria', link: 'https://lgbtnetwork.org/events/thrive-social-series-kween-astoria/' }

// ── The date: the JSON-LD one is genuinely unparseable ──

Deno.test('the raw JSON-LD date is NaN to new Date(), which is why the epoch wins', () => {
  // Both defects must be repaired. Padding only the offset is still NaN — an
  // earlier pass that fixed just the offset reported "0% agreement" between the
  // two date sources when in truth the comparison itself was broken.
  assertEquals(Number.isNaN(new Date('2026-9-30T18:00-4:00').getTime()), true)
  assertEquals(Number.isNaN(new Date('2026-9-30T18:00-04:00').getTime()), true)
  assertEquals(repairJsonLdDate('2026-9-30T18:00-4:00'), '2026-09-30T22:00:00.000Z')
})

Deno.test('a well-formed date needs no repair', () => {
  assertEquals(repairJsonLdDate('2026-10-01T18:00-04:00'), '2026-10-01T22:00:00.000Z')
  assertEquals(repairJsonLdDate(''), null)
  assertEquals(repairJsonLdDate('not a date'), null)
})

Deno.test('epochPair reads the unix pair and ignores a bogus end', () => {
  assertEquals(epochPair('<span data-time="1790805600-1790812800">'), { start: 1790805600, end: 1790812800 })
  // end <= start is not an end.
  assertEquals(epochPair('<span data-time="1790805600-1000000000">')?.end, null)
  assertEquals(epochPair('<span>'), null)
})

Deno.test('the epoch and the repaired JSON-LD agree — so the epoch is safe as primary', () => {
  const e = parseEvent(page(LD), ROW)!
  assertEquals(e.start, '2026-09-30T22:00:00.000Z')
  assertEquals(e.start, repairJsonLdDate(LD.startDate))
})

Deno.test('the epoch is used even when the JSON-LD date is missing entirely', () => {
  const e = parseEvent(page({ ...LD, startDate: undefined }), ROW)!
  assertEquals(e.start, '2026-09-30T22:00:00.000Z')
})

// ── Location: strict by decision ──
//
// pipeline-validate raises E_NO_LOCATION (an ERROR, not a warning) on a row with
// no venue_id, no city and no coordinates. And EventON's own data-latlng puts
// the Queens centre in Phoenix, Arizona. So an address must state city AND
// state, or it yields nothing.

Deno.test('an address with city and state is accepted', () => {
  assertEquals(parseUsAddress('34-10 30th Ave., Astoria, NY 11103'),
    { street: '34-10 30th Ave.', city: 'Astoria', state: 'NY', postal: '11103' })
  assertEquals(parseUsAddress('6025 Sound Ave, Riverhead, NY 11901'),
    { street: '6025 Sound Ave', city: 'Riverhead', state: 'NY', postal: '11901' })
})

Deno.test('a run-on city with no comma is still recovered', () => {
  // Real row: the source writes this one without a comma before the city.
  assertEquals(parseUsAddress('25 Ponquogue Ave. Hampton Bays, NY 11946'),
    { street: '25 Ponquogue Ave.', city: 'Hampton Bays', state: 'NY', postal: '11946' })
  assertEquals(parseUsAddress('2463 Main Street Bridgehampton, NY 11932'),
    { street: '2463 Main Street', city: 'Bridgehampton', state: 'NY', postal: '11932' })
})

Deno.test('an address WITHOUT a city yields nothing, by decision', () => {
  // These are the two highest-volume venues in the corpus — the org's own
  // centres — and they are exactly the ones whose upstream coordinates are
  // wrong. Their events are rejected downstream rather than mislocated.
  assertEquals(parseUsAddress('35-11 35th Ave'), { street: null, city: null, state: null, postal: null })
  assertEquals(parseUsAddress('125 Kennedy Dr Suite 100'), { street: null, city: null, state: null, postal: null })
  assertEquals(parseUsAddress('44 Union Street'), { street: null, city: null, state: null, postal: null })
  assertEquals(parseUsAddress('300 Main St Unit C'), { street: null, city: null, state: null, postal: null })
})

Deno.test('a two-letter token that is not a state is not treated as one', () => {
  assertEquals(parseUsAddress('12 Foo Ave, Bar, ZZ 11111').state, null)
  assertEquals(parseUsAddress('12 Foo Ave, Bar, XX').state, null)
})

Deno.test('country is only claimed when the address actually resolved', () => {
  const ok = parseEvent(page(LD), ROW)!
  assertEquals([ok.city, ok.state, ok.country], ['Astoria', 'NY', 'US'])
})

Deno.test('an event with no usable city is DROPPED, not staged', () => {
  // pipeline-validate would raise E_NO_LOCATION and reject it. Only ~15% of the
  // corpus carries a city, so staging the rest banks ~2,000 rejected rows to
  // learn what is already knowable at parse time.
  const bare = parseEvent(page({
    ...LD, location: [{ '@type': 'Place', name: 'LGBT Network Queens LGBT Center', address: { streetAddress: '35-11 35th Ave' } }],
  }), ROW)
  assertEquals(bare, null)
})

// ── Identity ──

Deno.test('identity is the WordPress post id, which is real and stable here', () => {
  // Unlike milchjugend, this source has no provisional ids: 200/200 sampled
  // were distinct and all below 10^7.
  const e = parseEvent(page(LD), ROW)!
  assertEquals(e.id, '35419')
  assertEquals(e.slug, 'thrive-social-series-kween-astoria')
})

// ── Rejects ──

Deno.test('parseEvent drops a row commit would RAISE on', () => {
  assertEquals(parseEvent(page({ ...LD, name: '' }, ''), { ...ROW }), null) // no title, no epoch
  assertEquals(parseEvent(page({ ...LD, startDate: undefined }, ''), ROW), null) // no date at all
  assertEquals(parseEvent(page(LD), { id: '', slug: 'x', link: '' }), null)
})

// ── event_type is deliberately NOT inferred ──
//
// Measured over 330 real titles, the shared ladder types 37 as `drag` of which
// only 3 contain "drag" — the other 34 match on "Queens", the NYC BOROUGH, via
// the rung `/\bdrag\b|travestie|tunte|queen[s]?\b/i`. 26 of those are youth
// events. That mislabel is the reason this source stays on a flat 'other'.

Deno.test('a Queens youth event is NOT typed drag', () => {
  const e = parseEvent(page({ ...LD, name: 'Queens Queer Youth Group (13-18) (In-Person)' }), ROW)!
  assertEquals(e.eventType, 'other')
})

Deno.test('event_type is a flat other, since the site publishes no taxonomy', () => {
  // event_type and event_type_2 were empty on all 200 rows sampled.
  for (const name of ['GAYme Night (18+)', 'Trivia Night (In-Person)', 'Drag Bingo Extravaganza']) {
    assertEquals(parseEvent(page({ ...LD, name }), ROW)!.eventType, 'other')
  }
})
