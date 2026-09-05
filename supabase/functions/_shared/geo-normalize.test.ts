import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildCountryCanon, canonCountry, countriesDisagree } from './geo-normalize.ts'

// A stand-in for the `countries` table. buildCountryCanon() derives the whole
// lookup from these rows plus COUNTRY_ALIASES, which is why pipeline-geo-validate
// needs no hand-maintained ISO list.
const ROWS = [
  { name: 'United States', code: 'US' },
  { name: 'Germany', code: 'DE' },
  { name: 'Switzerland', code: 'CH' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'Guam', code: 'GU' },
  { name: 'Guyana', code: 'GY' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Australia', code: 'AU' },
  { name: 'Hong Kong', code: 'HK' },
  { name: 'China', code: 'CN' },
  { name: 'Puerto Rico', code: 'PR' },
]
const CANON = buildCountryCanon(ROWS)

// ── The 652-row artifact ─────────────────────────────────────────────────────
// geo_validations carried 692 has_mismatch rows on 2026-09-04. Recomputing
// each verdict with the canonicalisation below leaves 41, so 652 were pure
// ISO-2-vs-English-name artifact and the signal ran at ~6% precision.
//
// The 41 survivors are real disagreements and include genuine defects
// (A-House, filed in Eastham MA, reverse-geocodes to Hobart, Australia). The
// queue was unreadable, not empty — these tests must kill the 652 without
// touching the 41.

Deno.test('ISO-2 code and English name are the same country', () => {
  for (const [code, name] of [
    ['US', 'United States'],
    ['DE', 'Germany'],
    ['CH', 'Switzerland'],
    ['GB', 'United Kingdom'],
  ] as const) {
    assertEquals(
      countriesDisagree(CANON, code, name),
      false,
      `${code} vs ${name} must not be a mismatch — this pair produced ${code === 'US' ? 245 : 'dozens of'} false alerts`,
    )
  }
})

Deno.test('Nominatim lowercase country_code matches stored uppercase ISO-2', () => {
  // Nominatim returns address.country_code lowercased.
  assertEquals(countriesDisagree(CANON, 'US', 'us'), false)
  assertEquals(countriesDisagree(CANON, 'DE', 'de'), false)
})

// ── Real disagreements must still be caught ──────────────────────────────────
// A check that is quiet on the false positives but also quiet on the real
// defects is worse than the broken one, because it looks fixed.

Deno.test('genuinely different countries still disagree', () => {
  // "Color pub and lounge": country text MY, coordinates in Penang,
  // linked to Georgetown, GUYANA.
  assertEquals(countriesDisagree(CANON, 'MY', 'GY'), true)
  assertEquals(countriesDisagree(CANON, 'Malaysia', 'gy'), true)
  assertEquals(countriesDisagree(CANON, 'US', 'Germany'), true)
})

Deno.test('the real findings buried in the 692 survive the fix', () => {
  // These are actual geo_validations rows. They are why the queue must be
  // cleaned rather than cleared: killing all 692 would discard them.
  // A-House — filed Eastham, Massachusetts; reverse-geocodes to Hobart.
  assertEquals(countriesDisagree(CANON, 'US', 'Australia'), true)
  // Nice Boys — filed Nice, France; reverse-geocodes to Philadelphia.
  assertEquals(countriesDisagree(CANON, 'FR', 'United States'), true)
  // Jinya — filed Tokyo; reverse-geocodes to the United States.
  assertEquals(countriesDisagree(CANON, 'JP', 'United States'), true)
})

// ── Unrecognised must never contradict recognised ────────────────────────────
// This is the guard that stops the fix from reproducing the bug in a new
// shape: a vocabulary gap must read as "no opinion", never as a finding.

Deno.test('unrecognised or empty values yield no opinion, not a mismatch', () => {
  assertEquals(canonCountry(CANON, 'Freedonia'), '')
  assertEquals(canonCountry(CANON, ''), '')
  assertEquals(canonCountry(CANON, null), '')
  assertEquals(canonCountry(CANON, undefined), '')

  assertEquals(countriesDisagree(CANON, 'US', 'Freedonia'), false)
  assertEquals(countriesDisagree(CANON, 'Freedonia', 'US'), false)
  assertEquals(countriesDisagree(CANON, null, 'US'), false)
  assertEquals(countriesDisagree(CANON, 'US', ''), false)
})

Deno.test('whitespace and case are not differences', () => {
  assertEquals(countriesDisagree(CANON, '  us  ', 'UNITED STATES'), false)
  assertEquals(canonCountry(CANON, '  De '), 'Germany')
})

Deno.test('aliases, local names and demonyms resolve', () => {
  assertEquals(canonCountry(CANON, 'Deutschland'), 'Germany')
  assertEquals(canonCountry(CANON, 'Schweiz'), 'Switzerland')
  assertEquals(canonCountry(CANON, 'england'), 'United Kingdom')
  assertEquals(canonCountry(CANON, 'american'), 'United States')
})

Deno.test('table rows win over the alias map for the same key', () => {
  // buildCountryCanon seeds from `countries` first and only fills gaps from
  // COUNTRY_ALIASES, so a country the DB knows can never be shadowed by a
  // hardcoded alias.
  const shadowed = buildCountryCanon([{ name: 'Czechia', code: 'CZ' }])
  assertEquals(shadowed.get('cz'), 'Czechia')
})

// ── Documented remaining false positive ──────────────────────────────────────
// Recorded as a test so it is a known, named limitation rather than a surprise
// when someone reads the queue. `countries` has no sovereign/parent column, so
// sovereignty is not representable here at all. It is resolved in the
// containment validator via geo_boundaries.sovereign_iso_a2 (Natural Earth).

Deno.test('KNOWN GAP: dependent territories and SARs still read as a mismatch', () => {
  // Measured in the surviving 41: six Hong Kong venues filed 'HK' that
  // reverse-geocode to China, and one Puerto Rico venue filed 'PR' that
  // reverse-geocodes to the United States. Both filings are correct.
  assertEquals(countriesDisagree(CANON, 'HK', 'China'), true)
  assertEquals(countriesDisagree(CANON, 'PR', 'United States'), true)
  // A Guam venue filed 'US' reverse-geocodes to 'gu'. Also correct, also flagged.
  assertEquals(countriesDisagree(CANON, 'US', 'gu'), true)
  // All three are resolved by geo_boundaries.sovereign_iso_a2 in the
  // containment validator, which is the first place sovereignty is
  // representable — `countries` has no sovereign/parent column.
})
