import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { validateCityNormalized, validateCountryNormalized } from './venue-pipeline-utils.ts'

/**
 * These bounds exist because `area_km2` and `elevation_m` had no validator
 * branch on any entity, and population was checked only for `isFinite && >= 0`.
 * Every fixture below is a real prod row, quoted at the value it was stored at
 * on 2026-09-08 — not an invented edge case.
 */

const city = (over: Record<string, unknown> = {}) => ({
  name: 'Testville',
  location: { lat: 47.4, lng: 8.5, country_code: 'CH' },
  metadata: {},
  ...over,
})

// --- area -------------------------------------------------------------------

Deno.test('city area: Hamilton, Bermuda is rejected', () => {
  // Stored at 1,138,110,000 km2 — about seven times the land area of Earth.
  const r = validateCityNormalized(city({ area_km2: 1_138_110_000 }))
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_AREA'), true)
})

Deno.test('city area: zero and negative are rejected', () => {
  assertEquals(validateCityNormalized(city({ area_km2: 0 })).warnings.includes('W_IMPLAUSIBLE_AREA'), true)
  assertEquals(validateCityNormalized(city({ area_km2: -5 })).warnings.includes('W_IMPLAUSIBLE_AREA'), true)
})

Deno.test('city area: the largest real municipality passes', () => {
  // Altamira, Brazil, ~159,533 km2. A bound that rejects this is too tight.
  assertEquals(validateCityNormalized(city({ area_km2: 159_533 })).warnings.includes('W_IMPLAUSIBLE_AREA'), false)
})

Deno.test('country area: every quoted figure for Russia passes', () => {
  // The bound was pinned to Wikidata's 17,098,246 exactly, leaving zero headroom
  // and flagging Russia itself on a Rosstat-sourced record. All three published
  // figures must pass, or the largest country on Earth is a defect.
  const base = { name: 'Testland', code: 'TL', metadata: {} }
  for (const area of [17_098_242, 17_098_246, 17_125_191]) {
    assertEquals(
      validateCountryNormalized({ ...base, area_km2: area }).warnings.includes('W_IMPLAUSIBLE_AREA'),
      false,
      `area ${area} should pass`,
    )
  }
  assertEquals(
    validateCountryNormalized({ ...base, area_km2: 20_000_000 }).warnings.includes('W_IMPLAUSIBLE_AREA'),
    true,
  )
})

Deno.test('country area: zero and negative are flagged', () => {
  const base = { name: 'Testland', code: 'TL', metadata: {} }
  assertEquals(validateCountryNormalized({ ...base, area_km2: 0 }).warnings.includes('W_IMPLAUSIBLE_AREA'), true)
  assertEquals(validateCountryNormalized({ ...base, area_km2: -1 }).warnings.includes('W_IMPLAUSIBLE_AREA'), true)
})

// --- elevation --------------------------------------------------------------

Deno.test('city elevation: Maui at 10,023 m is rejected', () => {
  // Above Everest. The stored figure is Mauna Kea measured from the seafloor.
  assertEquals(validateCityNormalized(city({ elevation_m: 10_023 })).warnings.includes('W_IMPLAUSIBLE_ELEVATION'), true)
})

Deno.test('city elevation: real extremes pass', () => {
  // La Rinconada, Peru ~5,100 m; the Dead Sea shore ~-430 m.
  assertEquals(validateCityNormalized(city({ elevation_m: 5_100 })).warnings.includes('W_IMPLAUSIBLE_ELEVATION'), false)
  assertEquals(validateCityNormalized(city({ elevation_m: -430 })).warnings.includes('W_IMPLAUSIBLE_ELEVATION'), false)
})

Deno.test('city elevation: below the lowest dry land is rejected', () => {
  // Caught by mutation testing: asserting only that -430 PASSES leaves the
  // lower bound free to be widened to -1e6 with every test still green.
  assertEquals(validateCityNormalized(city({ elevation_m: -1_200 })).warnings.includes('W_IMPLAUSIBLE_ELEVATION'), true)
})

Deno.test('city elevation: sea level is not treated as missing', () => {
  // 0 is falsy — a `!elevation` guard would silently skip every coastal city.
  assertEquals(validateCityNormalized(city({ elevation_m: 0 })).errors.length, 0)
})

// --- density ----------------------------------------------------------------

Deno.test('city density: the Paris metro-over-city-proper shape warns', () => {
  // 12,000,000 (Ile-de-France) over 105.4 km2 (city proper) = 113,852 /km2,
  // where field_provenance still records the 2,103,778 Wikidata supplied.
  const r = validateCityNormalized(city({ population: 12_000_000, area_km2: 105.4 }))
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_DENSITY'), true)
  assertEquals(r.errors.length, 0) // a warning: both numbers are individually defensible
})

Deno.test('city density: Manila, the densest real city, passes', () => {
  // ~1.85M over 42.88 km2 = ~43,000 /km2. The bound sits just above this.
  const r = validateCityNormalized(city({ population: 1_850_000, area_km2: 42.88 }))
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_DENSITY'), false)
})

Deno.test('city density: an absurdly small area is caught by density, not by the area bound', () => {
  // 0.1 m2. There is deliberately no minimum-area bound — a real hamlet can be
  // a fraction of a km2 — so density is what makes this pair reportable.
  const r = validateCityNormalized(city({ population: 500_000, area_km2: 0.0000001 }))
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_AREA'), false)
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_DENSITY'), true)
})

Deno.test('city density: not double-reported when the area is already rejected', () => {
  // Defensive, and synthetic on purpose: reaching this branch needs an area
  // past the upper bound AND a density past its own, i.e. a population in the
  // tens of billions. No real row can produce it — the assertion exists so the
  // guard cannot be dropped silently if either bound is ever loosened.
  const r = validateCityNormalized(city({ population: 20_000_000_000, area_km2: 300_000 }))
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_AREA'), true)
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_DENSITY'), false)
})

Deno.test('city density: needs both numbers', () => {
  assertEquals(validateCityNormalized(city({ population: 12_000_000 })).warnings.includes('W_IMPLAUSIBLE_DENSITY'), false)
  assertEquals(validateCityNormalized(city({ area_km2: 105.4 })).warnings.includes('W_IMPLAUSIBLE_DENSITY'), false)
})

// --- regression guards ------------------------------------------------------

Deno.test('a clean city produces no new codes', () => {
  // Zurich. Guards against a bound firing on ordinary data.
  const r = validateCityNormalized(city({ population: 434_000, area_km2: 87.88, elevation_m: 408 }))
  assertEquals(r.errors, [])
  assertEquals(r.warnings, [])
  assertEquals(r.quality, 100)
})

Deno.test('scalars are read from metadata as well as the top level', () => {
  // Adapters put these in `metadata`; a top-level-only read would check nothing.
  const r = validateCityNormalized({
    name: 'Testville',
    location: { lat: 1, lng: 1, country_code: 'CH' },
    metadata: { area_km2: 1_138_110_000, elevation_m: 10_023 },
  })
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_AREA'), true)
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_ELEVATION'), true)
})

Deno.test('scalars are read from the bare `area`/`elevation` metadata keys too', () => {
  // The third readNumber candidate. Deleting it left every other test green.
  const r = validateCityNormalized({
    name: 'Testville',
    location: { lat: 1, lng: 1, country_code: 'CH' },
    metadata: { area: 1_138_110_000, elevation: 10_023 },
  })
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_AREA'), true)
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_ELEVATION'), true)
})

// --- the invariant that makes all of the above safe -------------------------

Deno.test('a scalar bound NEVER produces an error, on any entity', () => {
  // LOAD-BEARING. `pipeline-validate` turns any `errors` entry into
  // ai_validation_status='rejected', and the human-approval trigger promotes
  // only 'pending' and 'needs_review' — a hard rejection is the one state an
  // admin can never override. If these codes were errors, one bad number would
  // permanently discard the whole staged entity: name, coordinates, country
  // link, legal payload. A bad number invalidates the number, not the row.
  const worst = validateCityNormalized(city({
    area_km2: 8_300_000_226,   // El Reno
    elevation_m: 10_023,       // Maui
    population: 343_000_000,   // Norfolk
  }))
  assertEquals(worst.errors, [])
  assertEquals(
    validateCountryNormalized({ name: 'Testland', code: 'TL', metadata: {}, area_km2: 1e12 }).errors,
    [],
  )
})

Deno.test('an empty-string scalar is missing, not zero', () => {
  // `Number('') === 0` and `Number.isFinite(0)` is true, so an unguarded read
  // turns a blank CSV cell or an empty OSM tag into a real 0, trips `area <= 0`
  // and flags an otherwise-good city. Blank-string metadata is common.
  for (const blank of ['', '   ']) {
    const r = validateCityNormalized(city({ metadata: { area_km2: blank, elevation_m: blank } }))
    assertEquals(r.warnings.includes('W_IMPLAUSIBLE_AREA'), false, `area ${JSON.stringify(blank)}`)
    assertEquals(r.warnings.includes('W_IMPLAUSIBLE_ELEVATION'), false, `elev ${JSON.stringify(blank)}`)
  }
})

Deno.test('W_IMPLAUSIBLE_POPULATION still fires and costs quality', () => {
  // Pre-existing code, previously untested, and this change gave it a -10.
  const r = validateCityNormalized(city({ population: 60_000_000 }))
  assertEquals(r.warnings.includes('W_IMPLAUSIBLE_POPULATION'), true)
  assertEquals(r.quality, 90)
  assertEquals(r.errors, [])
})
