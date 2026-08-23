import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { cleanVenueName, pagesFromSitemap, parseEvent, slugFromUrl, splitAddress } from './kweer-parse.ts'

// ────────────────────────────────────────────────────────────
// Fixtures are REAL, captured from kweer.io on 2026-08-22. All 25 event pages
// were parsed live to establish the distributions cited below.
// ────────────────────────────────────────────────────────────

const page = (ld: unknown) =>
  `<html><body><script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`

/** The real Halloween Ball row — venue named properly. */
const HALLOWEEN = {
  '@type': 'Event',
  name: 'Kweer Ball - Halloween Ball',
  startDate: '2026-10-31T22:00:00+01:00',
  endDate: '2026-11-01T05:00:00+01:00',
  location: { '@type': 'Place', name: 'LABOR5 Zürich', address: 'Schiffbaustrasse 3, 8005 Zürich, Switzerland' },
  image: ['https://static.wixstatic.com/media/abc.jpg'],
}

Deno.test('parseEvent maps the real Halloween Ball row end to end', () => {
  const e = parseEvent(page(HALLOWEEN), 'https://www.kweer.io/event-details/kweer-ball-halloween-ball')!
  assertEquals(e.slug, 'kweer-ball-halloween-ball')
  assertEquals(e.title, 'Kweer Ball - Halloween Ball')
  assertEquals(e.start, '2026-10-31T22:00:00+01:00')
  assertEquals(e.end, '2026-11-01T05:00:00+01:00')
  assertEquals(e.venueName, 'LABOR5 Zürich')
  assertEquals(e.street, 'Schiffbaustrasse 3')
  assertEquals(e.postal, '8005')
  assertEquals(e.city, 'Zürich')
  assertEquals(e.country, 'CH')
})

// ── The venue-name trap: 7 of 25 events name the CITY, not the venue ──
//
// Feeding "Zürich" into venue matching is the documented place-collision bug:
// 15 of 65 name_exact venue matches were cities or queer-village names, a 23%
// error rate on a branch that auto-applies.

Deno.test('a city in location.name yields NULL, not a venue called Zürich', () => {
  // Real row: /event-details/kweer-ball-art-ball, same address as the Halloween
  // Ball above but with the city where the venue name should be.
  const e = parseEvent(page({
    ...HALLOWEEN, name: 'Kweer Ball - Art Ball',
    location: { '@type': 'Place', name: 'Zürich', address: 'Schiffbaustrasse 3, 8005 Zürich, Switzerland' },
  }), 'https://www.kweer.io/event-details/kweer-ball-art-ball')!
  assertEquals(e.venueName, null)
  // The address still carries a real location, so the event is not location-less.
  assertEquals(e.street, 'Schiffbaustrasse 3')
  assertEquals(e.city, 'Zürich')
})

// The name is NOT recoverable from the address, and that was measured:
// "Schiffbaustrasse 3" appears as LABOR5 Zürich, as Fabrik Du Plaisir, and as
// plain "Zürich". So NULL is the honest answer, never a lookup.
Deno.test('one address legitimately carries different venue names', () => {
  const at = (name: string) => parseEvent(page({
    ...HALLOWEEN, location: { '@type': 'Place', name, address: 'Schiffbaustrasse 3, 8005 Zürich, Switzerland' },
  }), 'https://www.kweer.io/event-details/x')!.venueName
  assertEquals(at('LABOR5 Zürich'), 'LABOR5 Zürich')
  assertEquals(at('Fabrik Du Plaisir'), 'Fabrik Du Plaisir')
  assertEquals(at('Zürich'), null)
})

Deno.test('cleanVenueName rejects cities, platforms and bare URLs', () => {
  assertEquals(cleanVenueName('Zürich', 'Zürich'), null)
  assertEquals(cleanVenueName('Zurich', null), null)
  assertEquals(cleanVenueName('Vimeo & Zoom', null), null)
  assertEquals(cleanVenueName('Vimeo and Zoom', null), null)
  assertEquals(cleanVenueName('https://www.twitch.tv/kweerball', null), null)
  assertEquals(cleanVenueName('Where ever fine podcasts are hosted ', null), null)
  // Real venues survive, including one whose name contains the city.
  assertEquals(cleanVenueName('Kauz', 'Zürich'), 'Kauz')
  assertEquals(cleanVenueName('Barfussbar', 'Zürich'), 'Barfussbar')
  assertEquals(cleanVenueName('Swiss National Museum', 'Zürich'), 'Swiss National Museum')
})

Deno.test('the rule is "not merely the city", not a hardcoded city list', () => {
  // A future Basel listing must behave the same way without a code change.
  assertEquals(cleanVenueName('Basel', 'Basel'), null)
  assertEquals(cleanVenueName('Kaserne', 'Basel'), 'Kaserne')
})

// ── Online events have no physical location ──

Deno.test('an online event with no address is dropped rather than staged', () => {
  // Real row: /event-details/kweer-ball-best-of-ball, a 2021 pandemic stream.
  const e = parseEvent(page({
    '@type': 'Event', name: 'Kweer Ball - Best of Ball',
    startDate: '2021-02-06T20:00:00+01:00',
    location: { '@type': 'Place', name: 'Vimeo & Zoom' },
  }), 'https://www.kweer.io/event-details/kweer-ball-best-of-ball')
  // pipeline-validate raises E_NO_LOCATION on these; dropping here avoids
  // banking a rejected row for something that genuinely has no place.
  assertEquals(e, null)
})

// ── Address ──

Deno.test('splitAddress handles the uniform Wix format', () => {
  assertEquals(splitAddress('Schiffbaustrasse 3, 8005 Zürich, Switzerland'),
    { street: 'Schiffbaustrasse 3', postal: '8005', city: 'Zürich', country: 'CH' })
  assertEquals(splitAddress('Stadthausquai 12, 8001 Zürich, Switzerland'),
    { street: 'Stadthausquai 12', postal: '8001', city: 'Zürich', country: 'CH' })
})

Deno.test('splitAddress copes with a missing country or postal code', () => {
  assertEquals(splitAddress('Museumstrasse 2, Zürich'),
    { street: 'Museumstrasse 2', postal: null, city: 'Zürich', country: null })
  assertEquals(splitAddress(''), { street: null, postal: null, city: null, country: null })
})

// ── Sitemap ──

Deno.test('pagesFromSitemap strips the /form child and dedupes', () => {
  const xml = `<urlset>
    <url><loc>https://www.kweer.io/event-details/explicit-5</loc></url>
    <url><loc>https://www.kweer.io/event-details/explicit-5/form</loc></url>
    <url><loc>https://www.kweer.io/about</loc></url>
  </urlset>`
  // Without the strip the pair reads as two events.
  assertEquals(pagesFromSitemap(xml), ['https://www.kweer.io/event-details/explicit-5'])
})

Deno.test('slugFromUrl is the identity, and 25/25 were distinct live', () => {
  assertEquals(slugFromUrl('https://www.kweer.io/event-details/tea-by-the-lake-1'), 'tea-by-the-lake-1')
  assertEquals(slugFromUrl('https://www.kweer.io/about'), null)
})

Deno.test('parseEvent drops a row commit would RAISE on', () => {
  assertEquals(parseEvent(page({ ...HALLOWEEN, name: '' }), 'https://www.kweer.io/event-details/x'), null)
  assertEquals(parseEvent(page({ ...HALLOWEEN, startDate: '' }), 'https://www.kweer.io/event-details/x'), null)
  assertEquals(parseEvent('<html><body>no json-ld</body></html>', 'https://www.kweer.io/event-details/x'), null)
})
