import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  buildForwardQuery,
  countryContradicts,
  hasLocalityContext,
  haversineKm,
  isBareStreetAddress,
  isLocalityFallback,
  normPostal,
  postalContradicts,
  stampGeocode,
  type GeoVenue,
} from './geocode-guard.ts'

function venue(over: Partial<GeoVenue> = {}): GeoVenue {
  return {
    id: 'v1',
    name: 'Test',
    address: null,
    city: null,
    postal_code: null,
    country: null,
    country_id: null,
    ...over,
  }
}

// The live reproduction this guard was written for.
const KUNSTWERK = venue({
  name: 'KUNST-WERK am Kaiserhaus - Lehrwerkstatt e.V.',
  address: 'Möhnestraße 59',
  city: 'Arnsberg',
  postal_code: '59755',
  country: 'DE',
  country_id: 'de-uuid',
})

Deno.test('query carries every locality fact the row already has', () => {
  assertEquals(
    buildForwardQuery(KUNSTWERK, 'Germany', true),
    'Möhnestraße 59, 59755, Arnsberg, Germany',
  )
})

Deno.test('a component already spelled out in the address is not repeated', () => {
  const v = venue({ address: 'Möhnestraße 59, 59755 Arnsberg', city: 'Arnsberg', postal_code: '59755' })
  assertEquals(buildForwardQuery(v, 'Germany', true), 'Möhnestraße 59, 59755 Arnsberg, Germany')
})

Deno.test('the postal-free retry is a recall retry, not a looser query', () => {
  assertEquals(buildForwardQuery(KUNSTWERK, 'Germany', false), 'Möhnestraße 59, Arnsberg, Germany')
})

Deno.test('the Oberhausen answer is refused by the row Arnsberg postal code', () => {
  // What the bare-street query actually returned on 2026-08-22.
  assert(postalContradicts(KUNSTWERK.postal_code, '46049'))
  // What the corrected query returns — Neheim is a district of Arnsberg, so the
  // city name differs while the postal code agrees. It must NOT be refused.
  assertFalse(postalContradicts(KUNSTWERK.postal_code, '59755'))
})

Deno.test('a neighbouring postal unit is the same block, not a contradiction', () => {
  assertFalse(postalContradicts('1011 AB', '1011AC')) // NL, same block
  assertFalse(postalContradicts('SW1A 1AA', 'SW1A 2BB')) // UK, same district
  assert(postalContradicts('94110', '94103')) // US, different ZIP
  assert(postalContradicts('59755', '46049')) // DE, 85 km apart
})

Deno.test('a missing postcode on either side is absence of evidence', () => {
  assertFalse(postalContradicts(null, '46049'))
  assertFalse(postalContradicts('59755', null))
  assertFalse(postalContradicts('59755', ''))
  // Too short to be a postcode at all — not usable as a refusal.
  assertEquals(normPostal('12'), null)
  assertFalse(postalContradicts('12', '99999'))
})

Deno.test('country contradiction refuses, unknown country does not', () => {
  assert(countryContradicts('DE', 'fr'))
  assertFalse(countryContradicts('DE', 'de'))
  assertFalse(countryContradicts(null, 'fr')) // row has no resolved country
  assertFalse(countryContradicts('DE', null)) // hit carries no country_code
})

Deno.test('a bare street with no locality anywhere is not asked at all', () => {
  const bare = venue({ address: 'Möhnestraße 59' })
  assertFalse(hasLocalityContext(bare, null))
  assert(hasLocalityContext(venue({ address: 'Möhnestraße 59', city: 'Arnsberg' }), null))
  assert(hasLocalityContext(venue({ address: 'Möhnestraße 59', postal_code: '59755' }), null))
  assert(hasLocalityContext(bare, 'Germany'))
  assert(hasLocalityContext(venue({ address: 'Möhnestraße 59, Arnsberg' }), null))
})

Deno.test('a settlement-level hit is refused — it passes both other guards', () => {
  // Live shapes, captured 2026-08-22.
  assert(isLocalityFallback({ class: 'place', type: 'city', addresstype: 'city' })) // "Puerto Vallarta"
  assert(isLocalityFallback({ class: 'place', type: 'suburb', addresstype: 'suburb' })) // "Le Marais"
  assert(isLocalityFallback({ class: 'boundary', type: 'administrative', addresstype: 'administrative' }))
  // A real house comes back as class=place/type=house/addresstype=place. An
  // allow-list built from the obvious types would have refused this.
  assertFalse(isLocalityFallback({ class: 'place', type: 'house', addresstype: 'place' })) // Storegade 11C
  assertFalse(isLocalityFallback({ class: 'shop', type: 'convenience', addresstype: 'shop' })) // Haffner's
  assertFalse(isLocalityFallback({ class: 'highway', type: 'primary', addresstype: 'road' })) // Viale Marconi
  assertFalse(isLocalityFallback({ class: 'building', type: 'residential', addresstype: 'building' }))
  assertFalse(isLocalityFallback({}))
})

Deno.test('audit population is exactly the old bare-street query shape', () => {
  assert(isBareStreetAddress('Möhnestraße 59'))
  assertFalse(isBareStreetAddress('Möhnestraße 59, Arnsberg'))
  assertFalse(isBareStreetAddress('Möhnestraße 59 59755'))
})

Deno.test('haversine measures the reproduced 85 km error', () => {
  const km = haversineKm(51.4584822, 6.8222474, 51.4555545, 7.9688323)
  assert(km > 75 && km < 95, `expected ~80 km, got ${km}`)
})

Deno.test('the stamp merges rather than replacing enrichment_status', () => {
  const merged = stampGeocode(
    { centroid_repair: { state: 'nulled' } },
    { state: 'rejected', reason: 'postal_mismatch:46049_vs_59755' },
    '2026-08-22T00:00:00.000Z',
  )
  assertEquals(merged.centroid_repair, { state: 'nulled' })
  assertEquals(merged.geocode, {
    state: 'rejected',
    reason: 'postal_mismatch:46049_vs_59755',
    at: '2026-08-22T00:00:00.000Z',
  })
})
