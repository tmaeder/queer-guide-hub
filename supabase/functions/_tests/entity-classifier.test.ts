// Mirror of src/lib/__tests__/entityClassifier.test.ts so the Deno-side
// copy of the classifier stays in sync with the browser/Vite copy. Run with:
//   cd supabase/functions && deno test _tests/entity-classifier.test.ts
import { assertEquals } from 'jsr:@std/assert'
import {
  classifyEntity,
  expectedKindForTargetTable,
  isEntityTypeMismatch,
} from '../_shared/entity-classifier.ts'

Deno.test('classifies real persons with structured fields as person', () => {
  const r = classifyEntity({
    name: 'Lytton Strachey',
    birth_date: '1880-03-01',
    death_date: '1932-01-21',
    profession: 'biographer',
  })
  assertEquals(r.classified_as, 'person')
})

Deno.test('classifies "Sauna Tres Chic" as venue, not person', () => {
  const r = classifyEntity({ name: 'Sauna Tres Chic' })
  assertEquals(r.classified_as, 'venue')
})

Deno.test('classifies glossary slang ("DILF") as glossary_term', () => {
  const r = classifyEntity({
    name: 'DILF',
    description: 'A slang term for an attractive father.',
  })
  assertEquals(r.classified_as, 'glossary_term')
})

Deno.test('classifies UK postcode as unknown', () => {
  const r = classifyEntity({ name: 'BN2 1TH' })
  assertEquals(r.classified_as, 'unknown')
})

Deno.test('expectedKindForTargetTable maps known tables', () => {
  assertEquals(expectedKindForTargetTable('personalities'), 'person')
  assertEquals(expectedKindForTargetTable('venues'),        'venue')
  assertEquals(expectedKindForTargetTable('events'),        'event')
  assertEquals(expectedKindForTargetTable('countries'),     null)
})

Deno.test('isEntityTypeMismatch flags venue routed to personalities', () => {
  const cls = classifyEntity({ name: 'Sauna Tres Chic' })
  assertEquals(isEntityTypeMismatch(cls, 'personalities'), true)
})

Deno.test('isEntityTypeMismatch passes a real person', () => {
  const cls = classifyEntity({
    name: 'Lytton Strachey',
    birth_date: '1880-03-01',
    profession: 'biographer',
  })
  assertEquals(isEntityTypeMismatch(cls, 'personalities'), false)
})

// --- nested NormalizedItem shape (regression, 2026-08-21) --------------------
// Every `source-*` adapter emits `location.{address,lat,lng}` rather than flat
// fields, and pipeline-validate passes normalized_data straight in. Measured on
// production ingestion_staging: 38,126 of 39,002 venue rows nested it, 790 were
// flat. The classifier read only the flat keys, so ~98% of venue rows scored
// venue with no address and no geo.

Deno.test('classifyEntity reads the nested location shape', () => {
  const cls = classifyEntity({
    name: 'Tom Bar',
    location: { address: '1 Crucifix Hill, Floriana', city: 'Valletta', lat: 35.89335, lng: 14.50576 },
  })
  assertEquals(cls.classified_as, 'venue')
  assertEquals(cls.signals.includes('venue:has_address (+3)'), true)
  assertEquals(cls.signals.includes('venue:has_geo (+2)'), true)
})

Deno.test('classifyEntity still prefers flat keys when both are present', () => {
  const cls = classifyEntity({
    name: 'Somewhere',
    address: 'Flat Street 1',
    location: { address: 'Nested Street 2' },
  })
  assertEquals(cls.signals.includes('venue:has_address (+3)'), true)
})

Deno.test('a nested-location row is no longer entity-type-UNCLEAR', () => {
  // Previously scored 0 across the board -> unknown/confidence 0, which is what
  // pipeline-validate turns into W_ENTITY_TYPE_UNCLEAR.
  const cls = classifyEntity({ name: 'Fusion', location: { lat: 41.38, lng: 2.17 } })
  assertEquals(cls.classified_as === 'unknown' && cls.confidence === 0, false)
})

// --- short all-caps venue names are not glossary terms -----------------------
// All 35 E_ENTITY_TYPE_MISMATCH rejections in the Spartacus import were real
// venues whose names are acronyms. A glossary term has no map pin.

Deno.test('acronym-named venues with coordinates are not rejected as glossary terms', () => {
  for (const [name, lat, lng] of [
    ['XXL', 41.2358, 1.8055],    // club, Sitges
    ['GMF', 52.5200, 13.4050],   // club, Berlin
    ['DYMK', 1.3521, 103.8198],  // bar, Singapore
    ['AXM', 53.4808, -2.2426],   // bar, Manchester
    ['SPQR', -36.8485, 174.7633] // restaurant, Auckland
  ] as [string, number, number][]) {
    const cls = classifyEntity({ name, location: { lat, lng } })
    assertEquals(isEntityTypeMismatch(cls, 'venues'), false, `${name} rejected as ${cls.classified_as}`)
  }
})

Deno.test('acronym with coordinates but NO address still is not a glossary term', () => {
  // The narrow case the location guard exists for: geo alone (+2) used to lose
  // to the name-shape rule (+3).
  const cls = classifyEntity({ name: 'IDM', location: { lat: 48.8717, lng: 2.3522 } })
  assertEquals(cls.classified_as === 'glossary_term', false)
})

Deno.test('a genuine glossary term is still classified as one', () => {
  // The guard must not blunt the rule where it is right: no location, no pin.
  const cls = classifyEntity({ name: 'twink', description: 'A slang term for a young gay man.' })
  assertEquals(cls.classified_as, 'glossary_term')
  const acronym = classifyEntity({ name: 'AFAB' })
  assertEquals(acronym.classified_as, 'glossary_term')
})

Deno.test('null island coordinates do not count as a location', () => {
  const cls = classifyEntity({ name: 'AFAB', location: { lat: 0, lng: 0 } })
  assertEquals(cls.classified_as, 'glossary_term')
})
