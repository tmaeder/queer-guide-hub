import { assert, assertEquals, assertMatch } from 'jsr:@std/assert'
import {
  buildFoursquareSearchUrl,
  classifyFoursquareCategories,
  foursquarePhotoUrls,
  matchFoursquarePlace,
  normalizeFoursquareAggregateStats,
  normalizeFoursquarePlace,
  orderFoursquareDeltas,
  queerDiscoveryEvidence,
} from './foursquare.ts'

Deno.test('normalizes the current flat Places response shape', () => {
  const normalized = normalizeFoursquarePlace({
    sourceId: 'place-123',
    data: {
      fsq_place_id: 'place-123',
      name: 'Example Queer Bar',
      latitude: 47.3769,
      longitude: 8.5417,
      location: {
        address: 'Examplegasse 1',
        locality: 'Zürich',
        country: 'CH',
        formatted_address: 'Examplegasse 1, 8001 Zürich',
      },
      categories: [{ fsq_category_id: 'bar-id', name: 'Cocktail Bar' }],
      tel: '+41 44 555 00 00',
      website: 'https://example.test',
      rating: 8.7,
      photos: [{ prefix: 'https://img.test/', suffix: '.jpg' }],
      unresolved_flags: ['closed'],
      placemaker_url: 'https://foursquare.com/placemakers/review-place/place-123',
    },
  }) as unknown as Record<string, unknown>

  assertEquals(normalized.sourceName, 'foursquare')
  assertEquals(normalized.category, 'bar')
  assertEquals(normalized.location, {
    lat: 47.3769,
    lng: 8.5417,
    address: 'Examplegasse 1, 8001 Zürich',
    city: 'Zürich',
    country: 'CH',
    countryCode: 'CH',
  })
  assertEquals(normalized.images, ['https://img.test/300x300.jpg'])
  assertEquals(normalized.platform_ids, { foursquare: 'place-123' })
  assertEquals((normalized.metadata as Record<string, unknown>).unresolved_flags, ['closed'])
})

Deno.test('normalizes OS Places rows and retains release/freshness metadata', () => {
  const normalized = normalizeFoursquarePlace({
    sourceId: 'os-1',
    data: {
      fsq_place_id: 'os-1',
      name: 'Community House',
      latitude: 52.52,
      longitude: 13.405,
      address: 'Street 1',
      locality: 'Berlin',
      country: 'DE',
      fsq_category_ids: ['community-id'],
      fsq_category_labels: ['Community and Government > Community Center'],
      date_refreshed: '2026-09-01',
      _source_release_id: '2026-09',
      _requires_editorial_review: true,
    },
  }, 'foursquare_os') as unknown as Record<string, unknown>

  assertEquals(normalized.sourceName, 'foursquare_os')
  assertEquals(normalized.category, 'community_center')
  assertEquals((normalized.metadata as Record<string, unknown>).source_release_id, '2026-09')
  assertEquals((normalized.metadata as Record<string, unknown>).date_refreshed, '2026-09-01')
  assertEquals((normalized.metadata as Record<string, unknown>).requires_editorial_review, true)
})

Deno.test('accepts bounded cumulative sync counters and rejects unsafe values', () => {
  assertEquals(normalizeFoursquareAggregateStats({ records: 1_279, written: 190 }), {
    records: 1_279,
    written: 190,
  })
  for (const invalid of [null, [], { records: -1 }, { records: 1.5 }, { Records: 1 }]) {
    let threw = false
    try { normalizeFoursquareAggregateStats(invalid) } catch { threw = true }
    assert(threw)
  }
})

Deno.test('category mapping separates lodging subtypes and venue categories', () => {
  assertEquals(
    classifyFoursquareCategories({ fsq_category_labels: ['Travel and Transportation > Lodging > Hostel'] }),
    { venueCategory: 'hotel', accommodationType: 'hostel', labels: ['Travel and Transportation > Lodging > Hostel'] },
  )
  assertEquals(
    classifyFoursquareCategories({ categories: [{ name: 'Night Club' }] }).venueCategory,
    'club',
  )
  assertEquals(
    classifyFoursquareCategories({ categories: [{ name: 'Art Gallery' }] }).venueCategory,
    'gallery',
  )
})

Deno.test('discovery evidence is narrow and does not treat pride alone as queer proof', () => {
  assertEquals(queerDiscoveryEvidence({ name: 'Pride Cleaners' }), [])
  assertEquals(queerDiscoveryEvidence({ name: 'Queer Community Centre' }), ['name'])
  assertEquals(queerDiscoveryEvidence({ name: 'Cafe', description: 'Lesbian-owned community cafe' }), ['description'])
})

Deno.test('search URL uses the replacement host and current parameter names', () => {
  const url = new URL(buildFoursquareSearchUrl({
    query: 'gay bar',
    near: 'Berlin, Germany',
    limit: 100,
    categoryIds: ['one', 'two'],
  }))
  assertEquals(url.origin, 'https://places-api.foursquare.com')
  assertEquals(url.pathname, '/places/search')
  assertEquals(url.searchParams.get('limit'), '50')
  assertEquals(url.searchParams.get('fsq_category_ids'), 'one,two')
  const fields = url.searchParams.get('fields')?.split(',') ?? []
  assertMatch(fields.join(','), /fsq_place_id/)
  for (const premium of ['photos', 'rating', 'hours', 'attributes', 'description', 'popularity', 'price', 'stats', 'tastes']) {
    assertEquals(fields.includes(premium), false, `${premium} would turn this into a paid Premium call`)
  }
})

Deno.test('photo URLs discard malformed records', () => {
  assertEquals(foursquarePhotoUrls([
    { prefix: 'https://one/', suffix: '.jpg' },
    { prefix: 'https://bad/' },
    { prefix: 'https://two/', suffix: '.png' },
  ], '400x400'), ['https://one/400x400.jpg', 'https://two/400x400.png'])
})

Deno.test('delta records are processed add, update, merge, remove', () => {
  const ordered = orderFoursquareDeltas([
    { fsq_place_id: '4', action: 'remove' },
    { fsq_place_id: '2', action: 'update' },
    { fsq_place_id: '3', action: 'merge', redirect: '5' },
    { fsq_place_id: '1', action: 'add' },
  ])
  assertEquals(ordered.map((row) => row.action), ['add', 'update', 'merge', 'remove'])
})

Deno.test('matching auto-links stable IDs and exact nearby names', () => {
  const identity = matchFoursquarePlace(
    { fsq_place_id: 'known', name: 'Different spelling' },
    [{ id: 'venue-1', name: 'Original', foursquare_id: 'known' }],
  )
  assertEquals(identity.disposition, 'auto_match')
  assertEquals(identity.confidence, 1)

  const nearby = matchFoursquarePlace(
    { fsq_place_id: 'new', name: 'The Bar', latitude: 47.3769, longitude: 8.5417 },
    [{ id: 'venue-2', name: 'The Bar', latitude: 47.37691, longitude: 8.54171 }],
  )
  assertEquals(nearby.disposition, 'auto_match')
  assertEquals(nearby.confidence, 0.96)
  assert(nearby.reasons.includes('distance_75m'))
})

Deno.test('matching routes close competing candidates to review', () => {
  const decision = matchFoursquarePlace(
    { name: 'Community Centre', locality: 'London' },
    [
      { id: 'one', name: 'Community Centre', city: 'London' },
      { id: 'two', name: 'Community Centre', city: 'London' },
    ],
  )
  assertEquals(decision.disposition, 'review')
  assertEquals(decision.ambiguous, true)
})
