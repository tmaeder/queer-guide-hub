import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractJsonLdEvents, normaliseIsoDate } from './jsonld-event.ts'

const page = (...blocks: unknown[]) =>
  blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n')

// Shapes copied from the live pages seeded for World AIDS Day 2026.
const eventbrite = {
  '@context': 'https://schema.org', '@type': 'SocialEvent',
  name: 'World AIDS Day Observance', startDate: '2026-12-01T18:00:00-07:00', endDate: '2026-12-01T20:00:00-07:00',
  url: 'https://www.eventbrite.com/e/world-aids-day-observance-tickets-2002304640079',
  description: 'Center for Health &amp; Hope presents <b>World AIDS Day</b>',
  image: 'https://img.evbuc.com/x.jpg',
  location: { '@type': 'Place', name: 'Park Hill United Methodist Church',
    address: { '@type': 'PostalAddress', streetAddress: '5209 Montview Blvd', addressLocality: 'Denver', addressRegion: 'CO', postalCode: '80207', addressCountry: 'us' },
    geo: { '@type': 'GeoCoordinates', latitude: '39.7468', longitude: -104.9221 } },
}
const squarespace = {
  '@type': 'Event', name: 'World AIDS Day Vigil — Equality Community Center',
  startDate: '2026-12-01T17:30:00-0500', location: { '@type': 'Place', name: 'Equality Community Center', address: '15 Casco Street\nPortland, ME, 04101' },
}

Deno.test('reads a full Eventbrite Event: place, address, geo, decoded text', () => {
  const [e] = extractJsonLdEvents(page(eventbrite), 'https://page')
  assertEquals(e.title, 'World AIDS Day Observance')
  assertEquals(e.description, 'Center for Health & Hope presents World AIDS Day')
  assertEquals([e.venueName, e.city, e.region, e.postal, e.country], ['Park Hill United Methodist Church', 'Denver', 'CO', '80207', 'US'])
  assertEquals([e.lat, e.lng], [39.7468, -104.9221])
  assertEquals(e.url, eventbrite.url)
  assertEquals(e.online, false)
})

Deno.test('a string address is kept as street; colon-less offset is normalised', () => {
  const [e] = extractJsonLdEvents(page(squarespace), 'https://eccmaine.org/x')
  assertEquals(e.start, '2026-12-01T17:30:00-05:00')
  assertEquals(e.street, '15 Casco Street Portland, ME, 04101')
  assertEquals(e.city, null)
  assertEquals(e.url, 'https://eccmaine.org/x') // no url on the node -> the page
})

Deno.test('walks @graph, skips non-events, past events, bad JSON and duplicates', () => {
  const graph = { '@graph': [{ '@type': 'WebPage', name: 'x' }, squarespace, { '@type': 'Event', name: 'Old', startDate: '2024-12-01' }] }
  const html = page(graph, eventbrite, eventbrite) + '<script type="application/ld+json">{not json</script>'
  const got = extractJsonLdEvents(html, 'https://p', new Date('2026-11-01'))
  assertEquals(got.map((e) => e.title).sort(), ['World AIDS Day Observance', 'World AIDS Day Vigil — Equality Community Center'])
})

Deno.test('online-only event has no venue and is flagged online', () => {
  const [e] = extractJsonLdEvents(page({ '@type': 'Event', name: 'Online', startDate: '2026-12-01', location: { '@type': 'VirtualLocation', url: 'https://zoom.us' } }), 'https://p')
  assertEquals([e.online, e.venueName, e.city], [true, null, null])
})

Deno.test('an event without a name or a parseable start is dropped, not guessed', () => {
  assertEquals(extractJsonLdEvents(page({ '@type': 'Event', startDate: '2026-12-01' }, { '@type': 'Event', name: 'x', startDate: 'soon' }), 'https://p'), [])
  assertEquals(normaliseIsoDate('2026-12-01'), '2026-12-01')
})
