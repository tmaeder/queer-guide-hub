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
  postalJobOutcome,
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

Deno.test('query carries the row locality facts — but never the country name', () => {
  // The country is a countrycodes= FILTER, not a search term. Putting the name
  // in q took four findable prod addresses to zero results (see geocode-guard.ts).
  assertEquals(buildForwardQuery(KUNSTWERK, true), 'Möhnestraße 59, 59755, Arnsberg')
})

Deno.test('a component already spelled out in the address is not repeated', () => {
  const v = venue({ address: 'Möhnestraße 59, 59755 Arnsberg', city: 'Arnsberg', postal_code: '59755' })
  assertEquals(buildForwardQuery(v, true), 'Möhnestraße 59, 59755 Arnsberg')
})

Deno.test('the postal-free retry is a recall retry, not a looser query', () => {
  assertEquals(buildForwardQuery(KUNSTWERK, false), 'Möhnestraße 59, Arnsberg')
  // Rung 2 must actually DIFFER from rung 1, or the retry is a wasted request.
  assert(buildForwardQuery(KUNSTWERK, false) !== buildForwardQuery(KUNSTWERK, true))
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

Deno.test('a bare street with no locality is not asked at all', () => {
  assertFalse(hasLocalityContext(venue({ address: 'Möhnestraße 59' })))
  assert(hasLocalityContext(venue({ address: 'Möhnestraße 59', city: 'Arnsberg' })))
  assert(hasLocalityContext(venue({ address: 'Möhnestraße 59', postal_code: '59755' })))
  assert(hasLocalityContext(venue({ address: 'Möhnestraße 59, Arnsberg' })))
  // A country is NOT locality, even though it is enforced via countrycodes=.
  // "Storegade 11" restricted to Denmark is still every Danish town's main
  // street — that ambiguity put Cafe Davids 210 km from Vordingborg.
  assertFalse(hasLocalityContext(venue({ address: 'Storegade 11', country: 'DK', country_id: 'dk-uuid' })))
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

Deno.test('the repair bands match the three cases the audit could not separate', () => {
  // Every one of these was measured on prod and they all sit in 1-25 km, which
  // is why that band is flagged for a human and never auto-written:
  //   Dunkin'/Haffner's  4.9 km  genuinely wrong town (Chelmsford vs Westford)
  //   Massamara          1.4 km  street MIDPOINT vs a precise stored pin
  //   Zamboanga Electric 4.8 km  wrong BUSINESS on the right road ("Toyota …")
  const near = [4.9, 1.4, 4.8]
  for (const km of near) {
    assert(km >= 1 && km < 25, `${km} must land in the review band, not the repair band`)
  }
  // The unambiguous ones — no venue's true location is 25 km from a correctly
  // matched street inside its own postcode.
  for (const km of [3806, 701.1, 311.5, 210.6, 26.3]) {
    assert(km >= 25, `${km} must land in the repair band`)
  }
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

// ── postalJobOutcome ────────────────────────────────────────────────────────
//
// These pin the prod defect of 2026-09-05 (49 reported fills across two drain
// cycles, `missing_postal` unmoved). Each case is written so it FAILS against
// the old rule, which was `if (postcode || state || countrycode) { filled++;
// delete the row }`.

Deno.test('postalJobOutcome: a countrycode-only answer is NOT a fill', () => {
  // The exact prod shape. All five sampled venues already had country_id, so
  // even the country write hit zero rows — yet each was reported as filled and
  // deleted, and the hourly backlog re-selected it.
  const out = postalJobOutcome({ postcode: null }, false)
  assertEquals(out.filled, false)
  assertEquals(out.disposition, 'park')
})

Deno.test('postalJobOutcome: a postcode that was written IS a fill, and finishes the row', () => {
  const out = postalJobOutcome({ postcode: '10115' }, true)
  assertEquals(out.filled, true)
  assertEquals(out.disposition, 'done')
})

Deno.test('postalJobOutcome: a postcode that hit no row is done but NOT counted', () => {
  // Concurrent fill: the row already had a postal code, so the guarded update
  // matched nothing. The work is finished either way, but claiming a fill we
  // did not perform is precisely how the original bug read as success.
  const out = postalJobOutcome({ postcode: '10115' }, false)
  assertEquals(out.filled, false)
  assertEquals(out.disposition, 'done')
})

Deno.test('postalJobOutcome: an empty answer parks rather than deleting', () => {
  // Deleting is what let the row come back every hour. Parking is the memory
  // the drain and the backlog both already respect.
  for (const geo of [null, { postcode: null }]) {
    const out = postalJobOutcome(geo, false)
    assertEquals(out.disposition, 'park')
    assertEquals(out.filled, false)
  }
})
