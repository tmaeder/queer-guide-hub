import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { buildFoursquareSearchUrl, FOURSQUARE_SEARCH_FIELDS, classifyFoursquareCategories, normalizeFoursquarePlace, queerDiscoveryEvidence, normalizeFoursquareAggregateStats, orderFoursquareDeltas, matchFoursquarePlace } from './foursquare.ts'
Deno.test('search uses current API and only explicit pro fields without premium media requests', () => {
  const u = new URL(buildFoursquareSearchUrl({ query: 'gay bar', near: 'Zurich', limit: 100 }))
  assertEquals(u.origin, 'https://places-api.foursquare.com')
  assertEquals(u.searchParams.get('limit'), '50')
  assertEquals(u.searchParams.get('query'), 'gay bar')
  assertEquals(u.searchParams.get('fields'), FOURSQUARE_SEARCH_FIELDS)
  for (const field of ['photos', 'rating', 'hours', 'attributes', 'description', 'popularity', 'price', 'stats', 'tastes', 'tips']) assertEquals(FOURSQUARE_SEARCH_FIELDS.split(',').includes(field), false)
})
Deno.test('query escaping cannot add a premium field', () => {
  const u = new URL(buildFoursquareSearchUrl({ query: 'bar&fields=photos', near: 'London' }))
  assertEquals(u.searchParams.get('query'), 'bar&fields=photos')
  assertEquals(u.searchParams.getAll('fields'), [FOURSQUARE_SEARCH_FIELDS])
})
Deno.test('missing and malformed coordinate scalars never become manufactured zero axes', () => {
  for (const value of [null, undefined, '', ' ', true, false, {}, [], '0x10', 'NaN']) {
    const n = normalizeFoursquarePlace({ sourceId: 'x', data: { name: 'Example', latitude: value, longitude: 8.5 } })
    assertEquals(n.location?.lat, undefined)
  }
  assertEquals(normalizeFoursquarePlace({ sourceId: 'x', data: { latitude: '0', longitude: 8.5 } }).location?.lat, 0)
})
Deno.test('generic hotel category stays taxonomy without discovery evidence', () => {
  const place = { name: 'Example Hotel', categories: [{ name: 'Hotel' }], _search_term: 'gay friendly hotel' }
  assertEquals(classifyFoursquareCategories(place).venueCategory, 'hotel')
  assertEquals(queerDiscoveryEvidence(place), [])
})
Deno.test('all explicit LGBT acronym forms are preserved in normalized discovery evidence', () => {
  for (const term of ['LGBT', 'LGBTQ', 'LGBTQI', 'LGBTQIA', 'LGBTI', 'LGBTIQ']) assertEquals(queerDiscoveryEvidence({ description: `${term} community space` }), ['description'])
})
Deno.test('aggregate counters refuse negative noninteger and unbounded payloads', () => {
  assertEquals(normalizeFoursquareAggregateStats({ matched: 3 }), { matched: 3 })
  for (const value of [{ bad: -1 }, { bad: 1.5 }, { bad: '3' }, Object.fromEntries(Array.from({ length: 51 }, (_, i) => ['n'+i, i]))]) assertThrows(() => normalizeFoursquareAggregateStats(value))
})
Deno.test('delta ordering keeps add update merge remove and preserves ties', () => {
  const records = (['remove', 'update', 'add', 'merge'] as const).map((action, i) => ({ action, fsq_place_id: String(i) }))
  assertEquals(orderFoursquareDeltas(records).map(r => r.action), ['add', 'update', 'merge', 'remove'])
})
Deno.test('missing corroboration does not auto match arbitrary venue', () => {
  assertEquals(matchFoursquarePlace({ name: 'Example' }, []).disposition, 'no_match')
})
