import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  idFromUrl, isRealDetailPage, parseEvent, parseLocation, plausibleCoord,
  slugFromUrl, splitLocality, stripTags, urlsFromSitemap,
} from './gaybasel-parse.ts'

// ────────────────────────────────────────────────────────────
// Fixtures are REAL, captured from gaybasel.org on 2026-08-22 and trimmed to
// the markup the parser reads. Verified live: 7/7 events and 90/91 locations
// parse, with zero heuristic misfires over 91 location pages.
// ────────────────────────────────────────────────────────────

const MARKER = 'Zurück zur Übersicht'

/** The real JSON-LD from /events/13311/zischbar. */
const ZISCHBAR_LD = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'Zischbar',
  startDate: '2026-08-25T18:00:00+02:00',
  location: {
    '@type': 'Place',
    name: 'Zischbar',
    address: { '@type': 'PostalAddress', streetAddress: 'Klybeckstrasse 1b', addressLocality: 'Basel', addressCountry: 'CH' },
  },
  image: ['https://www.gaybasel.org/cache/images/9/6/6/9/9/966.jpg'],
}

const eventPage = (ld: unknown) =>
  `<html><body><a>${MARKER}</a><script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`

// ── The soft-404: the single most important guard in this file ──
//
// Every unknown path on this host answers HTTP 200 with an identical shell, so
// res.ok proves nothing and the sitemap does contain ids that no longer resolve.
// Parsing the shell would yield an empty "success" — the scrape_sources failure.

Deno.test('the soft-404 shell is rejected even though it is HTTP 200', () => {
  const shell = '<html><body><div>Nächste Party: Gayties</div><div>Spenden</div></body></html>'
  assertEquals(isRealDetailPage(shell), false)
  assertEquals(parseEvent(shell, 'https://www.gaybasel.org/events/13311/zischbar'), null)
  assertEquals(parseLocation(shell, 'https://www.gaybasel.org/locations/6851/69h'), null)
})

Deno.test('a page carrying the detail marker is accepted', () => {
  assertEquals(isRealDetailPage(`<a>${MARKER}</a>`), true)
  assertEquals(isRealDetailPage(''), false)
  assertEquals(isRealDetailPage(undefined), false)
})

// ── Sitemap ──

Deno.test('urlsFromSitemap splits events from locations and rewrites the host', () => {
  const xml = `<urlset>
    <url><loc>https://www.gaybasel.ch/events/13311/zischbar</loc></url>
    <url><loc><![CDATA[https://www.gaybasel.ch/locations/6851/69h]]></loc></url>
    <url><loc>https://www.gaybasel.ch/tipp/123/something</loc></url>
    <url><loc>https://www.gaybasel.ch/events/13311/zischbar</loc></url>
  </urlset>`
  const { events, locations } = urlsFromSitemap(xml)
  // .ch 301s to .org on every request; rewriting saves a redirect per URL.
  assertEquals(events, ['https://www.gaybasel.org/events/13311/zischbar'])
  assertEquals(locations, ['https://www.gaybasel.org/locations/6851/69h'])
})

Deno.test('ids and slugs come from the URL, which is the site\'s own key', () => {
  assertEquals(idFromUrl('https://www.gaybasel.org/events/13311/zischbar', 'events'), '13311')
  assertEquals(idFromUrl('https://www.gaybasel.org/locations/6851/69h', 'locations'), '6851')
  assertEquals(idFromUrl('https://www.gaybasel.org/tipp/1/x', 'events'), null)
  assertEquals(slugFromUrl('https://www.gaybasel.org/locations/6851/69h'), '69h')
})

// ── The "4058 Basel" trap ──
//
// addressLocality is sometimes the city and sometimes "<postal> <city>".
// A numeric-leading city fails events_city_nonjunk_check on the way in.

Deno.test('splitLocality separates a postal code fused into the city', () => {
  assertEquals(splitLocality('4058 Basel'), { postal: '4058', city: 'Basel' })
  assertEquals(splitLocality('Basel'), { postal: null, city: 'Basel' })
  assertEquals(splitLocality('4057'), { postal: '4057', city: null })
  assertEquals(splitLocality(''), { postal: null, city: null })
})

Deno.test('an event with a fused locality splits it rather than passing it through', () => {
  const e = parseEvent(eventPage({
    ...ZISCHBAR_LD, name: 'Themenabend Schwule Väter',
    startDate: '2026-09-15T19:30:00+02:00',
    location: { '@type': 'Place', name: 'Hirscheneck', address: { streetAddress: 'Lindenberg 23', addressLocality: '4058 Basel', addressCountry: 'CH' } },
  }), 'https://www.gaybasel.org/events/13144/themenabend-schwule-vaeter')!
  assertEquals(e.city, 'Basel')
  assertEquals(e.postal, '4058')
})

// ── The tri-border trap ──
//
// GayBasel covers CH/DE/FR. Measured: 3 of 46 sampled locations are in Freiburg
// im Breisgau, Germany. A Switzerland-only coordinate gate is data loss, not
// safety — it would silently drop real venues.

Deno.test('plausibleCoord keeps German and French venues, not just Swiss ones', () => {
  assertEquals(plausibleCoord(47.5686, 7.5892), { lat: 47.5686, lng: 7.5892 })  // Basel, CH
  assertEquals(plausibleCoord(47.9939, 7.8467), { lat: 47.9939, lng: 7.8467 })  // Freiburg, DE
  assertEquals(plausibleCoord(47.7508, 7.3359), { lat: 47.7508, lng: 7.3359 })  // Mulhouse, FR
})

Deno.test('plausibleCoord rejects the null island and anything far away', () => {
  assertEquals(plausibleCoord(0, 0), null)
  assertEquals(plausibleCoord(33.4894, -112.1343), null) // Phoenix — the lgbtnetwork class
  assertEquals(plausibleCoord(null, undefined), null)
  assertEquals(plausibleCoord('abc', 7.5), null)
})

// ── Events ──

Deno.test('parseEvent maps the real Zischbar row end to end', () => {
  const e = parseEvent(eventPage(ZISCHBAR_LD), 'https://www.gaybasel.org/events/13311/zischbar')!
  assertEquals(e.id, '13311')
  assertEquals(e.slug, 'zischbar')
  assertEquals(e.title, 'Zischbar')
  // The source already supplies a correct offset — no German date parsing.
  assertEquals(e.start, '2026-08-25T18:00:00+02:00')
  assertEquals(e.venueName, 'Zischbar')
  assertEquals(e.street, 'Klybeckstrasse 1b')
  assertEquals(e.city, 'Basel')
  assertEquals(e.country, 'CH')
  assertEquals(e.image, 'https://www.gaybasel.org/cache/images/9/6/6/9/9/966.jpg')
})

Deno.test('an empty streetAddress becomes null, not ""', () => {
  const e = parseEvent(eventPage({
    ...ZISCHBAR_LD, name: 'pink.friday #47',
    location: { '@type': 'Place', name: 'kult.kino', address: { streetAddress: '', addressLocality: 'Basel', addressCountry: 'CH' } },
  }), 'https://www.gaybasel.org/events/13289/pink-friday-47')!
  assertEquals(e.street, null)
  assertEquals(e.venueName, 'kult.kino')
})

Deno.test('parseEvent drops a row commit would RAISE on', () => {
  assertEquals(parseEvent(eventPage({ ...ZISCHBAR_LD, name: '' }), 'https://www.gaybasel.org/events/1/x'), null)
  assertEquals(parseEvent(eventPage({ ...ZISCHBAR_LD, startDate: '' }), 'https://www.gaybasel.org/events/1/x'), null)
  assertEquals(parseEvent(`<a>${MARKER}</a>`, 'https://www.gaybasel.org/events/1/x'), null) // no JSON-LD
})

Deno.test('a non-ISO2 addressCountry is dropped rather than stored', () => {
  const e = parseEvent(eventPage({
    ...ZISCHBAR_LD,
    location: { '@type': 'Place', name: 'X', address: { addressLocality: 'Basel', addressCountry: 'Schweiz' } },
  }), 'https://www.gaybasel.org/events/1/x')!
  assertEquals(e.country, null)
})

// ── Locations ──

/** Trimmed from the real /locations/6851/69h. */
const LOC_69H = `<html><body>
  <a>${MARKER}</a>
  <h1>69H</h1>
  <h2>Adresse</h2>
  <p>69H</p>
  <p>Oetlingerstrasse 69H</p>
  <p>Basel</p>
  <a>Karte</a>
  <img src="https://maps.google.com/maps?ll=47.568639100000,7.589217200000&amp;z=16">
</body></html>`

Deno.test('parseLocation reads the real 69H page', () => {
  const v = parseLocation(LOC_69H, 'https://www.gaybasel.org/locations/6851/69h')!
  assertEquals(v.id, '6851')
  assertEquals(v.name, '69H')
  assertEquals(v.street, 'Oetlingerstrasse 69H')
  assertEquals(v.city, 'Basel')
  assertEquals(v.lat, 47.5686391)
  assertEquals(v.lng, 7.5892172)
})

Deno.test('the (tba) placeholder is not a venue', () => {
  // /locations/6640/tba — "To be announced", the site's stand-in for an
  // unannounced venue. Staging it would invent a place.
  const html = `<html><body><a>${MARKER}</a><h1>(tba)</h1><h2>Adresse</h2><p>(tba)</p></body></html>`
  assertEquals(parseLocation(html, 'https://www.gaybasel.org/locations/6640/tba'), null)
})

Deno.test('a location with no coordinates still parses — 40% of them have none', () => {
  const html = `<html><body><a>${MARKER}</a><h1>Kaserne</h1><h2>Adresse</h2><p>Kaserne</p><p>Klybeckstrasse 1b</p><p>4057 Basel</p></body></html>`
  const v = parseLocation(html, 'https://www.gaybasel.org/locations/123/kaserne')!
  assertEquals(v.city, 'Basel')
  assertEquals(v.postal, '4057')
  assertEquals(v.lat, null)
})

Deno.test('stripTags decodes &amp; last so escaped markup stays escaped', () => {
  assertEquals(stripTags('<p>Bar &amp; Club</p>'), 'Bar & Club')
  assertEquals(stripTags('a &amp;lt;b&amp;gt;'), 'a &lt;b&gt;')
})
