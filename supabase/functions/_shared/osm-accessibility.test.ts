import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { OSM_ACCESSIBILITY_SLUGS, osmAccessibility } from './osm-accessibility.ts'
import { ACCESSIBILITY_CONTRADICTIONS } from './accessibility-vocab.ts'

Deno.test('all four wheelchair values are read, not just yes', () => {
  // source-osm-venue read `tags.wheelchair === 'yes'` and nothing else, so
  // `limited` and `no` were silently discarded. `no` is the one that matters
  // most: it is a measurement someone made, and dropping it publishes silence
  // where the map says "you cannot get in".
  assertEquals(osmAccessibility({ wheelchair: 'yes' }), ['wheelchair-accessible'])
  assertEquals(osmAccessibility({ wheelchair: 'designated' }), ['wheelchair-accessible'])
  assertEquals(osmAccessibility({ wheelchair: 'limited' }), ['limited-wheelchair-access'])
  assertEquals(osmAccessibility({ wheelchair: 'no' }), ['not-wheelchair-accessible'])
})

Deno.test('a `no` is NEVER collapsed into absence', () => {
  for (const [tag, slug] of [
    ['wheelchair', 'not-wheelchair-accessible'],
    ['toilets:wheelchair', 'no-accessible-restroom'],
  ] as const) {
    assertEquals(osmAccessibility({ [tag]: 'no' }), [slug])
  }
  assertEquals(osmAccessibility({ step_count: '3' }), ['not-step-free'])
})

Deno.test('unisex toilets map to gender-neutral-restroom from either tag', () => {
  assertEquals(osmAccessibility({ 'toilets:unisex': 'yes' }), ['gender-neutral-restroom'])
  assertEquals(osmAccessibility({ unisex: 'yes' }), ['gender-neutral-restroom'])
  // ...and `unisex=no` asserts nothing: there is no negative term for it, and
  // inventing one from a segregated-toilet tag would be a claim we cannot back.
  assertEquals(osmAccessibility({ unisex: 'no' }), [])
})

Deno.test('step_count discriminates on the number, and 0 is step-free', () => {
  assertEquals(osmAccessibility({ step_count: '0' }), ['step-free-entrance'])
  assertEquals(osmAccessibility({ step_count: '1' }), ['not-step-free'])
  // Non-numeric junk asserts nothing rather than guessing a polarity.
  assertEquals(osmAccessibility({ step_count: 'some' }), [])
  assertEquals(osmAccessibility({ step_count: '' }), [])
})

Deno.test('an unmapped or absent value yields nothing at all', () => {
  assertEquals(osmAccessibility({}), [])
  assertEquals(osmAccessibility({ wheelchair: 'maybe' }), [])
  assertEquals(osmAccessibility({ wheelchair: '' }), [])
  assertEquals(osmAccessibility({ amenity: 'bar', name: 'Roses' }), [])
  // wheelchair:description is free prose. Reading it is LLM territory and LLM
  // accessibility is always review-gated — it must not enter here.
  assertEquals(osmAccessibility({ 'wheelchair:description': 'ramp at the side door' }), [])
})

Deno.test('capacity:disabled only asserts on a positive count', () => {
  assertEquals(osmAccessibility({ 'capacity:disabled': '2' }), ['accessible-parking'])
  assertEquals(osmAccessibility({ 'capacity:disabled': 'yes' }), ['accessible-parking'])
  assertEquals(osmAccessibility({ 'capacity:disabled': '0' }), [])
  assertEquals(osmAccessibility({ 'capacity:disabled': 'no' }), [])
})

Deno.test('a real Berlin bar element maps end to end', () => {
  assertEquals(
    osmAccessibility({
      amenity: 'bar',
      name: 'SchwuZ',
      lgbtq: 'primary',
      wheelchair: 'yes',
      'toilets:wheelchair': 'yes',
      'toilets:unisex': 'yes',
      step_count: '0',
      outdoor_seating: 'yes',
    }),
    ['accessible-restroom', 'gender-neutral-restroom', 'step-free-entrance', 'wheelchair-accessible'],
  )
})

Deno.test('OSM can contradict itself and the mapper reports both halves', () => {
  // Resolution belongs downstream, where the conflict becomes a review row.
  // Silently dropping one half here would hide the disagreement from the
  // consensus engine that exists to surface it.
  assertEquals(
    osmAccessibility({ wheelchair: 'no', 'toilets:wheelchair': 'yes' }).sort(),
    ['accessible-restroom', 'not-wheelchair-accessible'],
  )
})

Deno.test('output is sorted and free of duplicates', () => {
  const out = osmAccessibility({ wheelchair: 'yes', ramp: 'yes', 'ramp:wheelchair': 'yes' })
  assertEquals(out, [...new Set(out)].sort())
  assertEquals(out, ['ramp-access', 'wheelchair-accessible'])
})

Deno.test('every slug the mapper can emit is declared, and the negatives are covered', () => {
  // OSM_ACCESSIBILITY_SLUGS is what the migration asserts against public.amenities.
  // A slug this mapper emits but the vocabulary lacks would be written and then
  // silently dropped by default-reject, which reads as "no data".
  const negatives = ACCESSIBILITY_CONTRADICTIONS.map(([, n]) => n)
  for (const n of negatives) {
    assertEquals(OSM_ACCESSIBILITY_SLUGS.includes(n), true, `${n} must be reachable from OSM`)
  }
  assertEquals(OSM_ACCESSIBILITY_SLUGS, [...new Set(OSM_ACCESSIBILITY_SLUGS)].sort())
})
