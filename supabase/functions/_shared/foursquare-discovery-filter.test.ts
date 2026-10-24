import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { filterFoursquareDiscoveries, hasFoursquareDiscoveryEvidence } from './foursquare-discovery-filter.ts'
Deno.test('generic hotels bars and query text cannot establish discovery relevance', () => {
  for (const place of [
    { name: 'Carlton Bar', categories: [{ name: 'Hotel Bar' }], _search_term: 'gay bar' },
    { name: 'Rainbow Resort', description: 'Pride in our service', _search_term: 'lgbtq hotel' },
    { name: 'Gaylord Hotel', categories: [{ name: 'Hotel' }] },
    { name: 'Sporthotel Bären', _requires_editorial_review: true },
  ]) assertEquals(hasFoursquareDiscoveryEvidence(place), false)
})
Deno.test('explicit provider evidence retains the independent review candidate', () => {
  for (const place of [
    { name: 'Example', categories: [{ name: 'Gay Bar' }] },
    { name: 'Example', fsq_category_labels: ['Lesbian Bar'] },
    { name: 'Example', description: 'An LGBTQ community space' },
    { name: 'Example', website: 'https://example.org/queer' },
  ]) assertEquals(hasFoursquareDiscoveryEvidence(place), true)
})
Deno.test('known canonical identities retain contact enrichment and source ordering', () => {
  const known = { sourceId: 'known', data: { name: 'Generic Hotel' } }
  const irrelevant = { sourceId: 'new', data: { name: 'Generic Hotel' } }
  const discovery = { sourceId: 'gay', data: { name: 'Gay Bar' } }
  assertEquals(filterFoursquareDiscoveries([known, irrelevant, discovery], new Set(['known'])), [known, discovery])
})
