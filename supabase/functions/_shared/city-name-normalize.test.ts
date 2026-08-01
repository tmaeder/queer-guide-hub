import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { cityNameCandidates } from './city-name-normalize.ts'

// The real starved cohort: comma-qualified, German-localized import residue.
Deno.test('strips a country suffix and keeps the bare toponym', () => {
  const r = cityNameCandidates('Kapstadt, Südafrika', { country: 'South Africa' })
  assertEquals(r.base, 'Kapstadt')
  assertEquals(r.queries, ['Kapstadt, South Africa', 'Kapstadt', 'Kapstadt, Südafrika'])
  assertEquals(r.suspect, false)
})

Deno.test('strips multiple qualifiers', () => {
  const r = cityNameCandidates('El Cajon, Kalifornien, USA', { country: 'United States' })
  assertEquals(r.base, 'El Cajon')
  assertEquals(r.queries[0], 'El Cajon, United States')
})

Deno.test('splits on spaced dashes as well as commas', () => {
  assertEquals(cityNameCandidates('Arles – Provence').base, 'Arles')
  assertEquals(cityNameCandidates('Frankfurt - Hessen').base, 'Frankfurt')
})

Deno.test('hyphenated city names survive (no spaces around the dash)', () => {
  const r = cityNameCandidates('Baden-Baden', { country: 'Germany' })
  assertEquals(r.base, 'Baden-Baden')
})

Deno.test('drops a trailing parenthetical disambiguator', () => {
  assertEquals(cityNameCandidates('Springfield (Illinois)').base, 'Springfield')
})

Deno.test('dedupes when no country is supplied', () => {
  assertEquals(cityNameCandidates('Lisbon').queries, ['Lisbon'])
})

Deno.test('country-qualified query comes first, raw string last', () => {
  const r = cityNameCandidates('Cologne', { country: 'Germany' })
  assertEquals(r.queries, ['Cologne, Germany', 'Cologne'])
})

Deno.test('flags placeholder names', () => {
  assertEquals(cityNameCandidates('—N/a').suspectReason, 'placeholder')
  assertEquals(cityNameCandidates('N/A').suspectReason, 'placeholder')
  assertEquals(cityNameCandidates('---').suspectReason, 'placeholder')
  assertEquals(cityNameCandidates('').suspectReason, 'placeholder')
})

Deno.test('flags numeric junk', () => {
  assertEquals(cityNameCandidates('7th place').suspectReason, 'numeric')
})

Deno.test('flags too-short names', () => {
  assertEquals(cityNameCandidates('X').suspectReason, 'too_short')
})

Deno.test('flags rows named after a country or region', () => {
  // COUNTRY_ALIASES covers the localized forms.
  assertEquals(cityNameCandidates('Deutschland').suspectReason, 'country_or_region_only')
  // knownPlaceNames carries countries.name + regions.name from the caller.
  const known = new Set(['indonesia', 'indonesien', 'baskenland'])
  assertEquals(
    cityNameCandidates('Indonesien', { knownPlaceNames: known }).suspectReason,
    'country_or_region_only',
  )
  assertEquals(
    cityNameCandidates('Baskenland', { knownPlaceNames: known }).suspectReason,
    'country_or_region_only',
  )
})

Deno.test('a real city that shares a country name is NOT flagged when unknown', () => {
  // Luxembourg/Singapore/Monaco/Panama are real cities. The suspect flag is
  // advisory; disposition additionally requires a failed QID resolution.
  const r = cityNameCandidates('Luxembourg', { country: 'Luxembourg' })
  assertEquals(r.base, 'Luxembourg')
  assertEquals(r.queries[0], 'Luxembourg, Luxembourg')
})

Deno.test('collapses whitespace and normalizes unicode', () => {
  assertEquals(cityNameCandidates('  São   Paulo  ').base, 'São Paulo'.normalize('NFC'))
})
