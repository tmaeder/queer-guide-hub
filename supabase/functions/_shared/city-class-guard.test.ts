import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  CITY_REFRESH_SCOPES,
  cityClassVerdict,
  isCityRefreshScope,
} from './city-class-guard.ts'

// `Illinois` is the one fixture MEASURED live against Wikidata while writing this
// module: wbsearchentities("Illinois") -> Q1204, whose P31 is Q35657, labelled
// "U.S. state". It is the head of the real `qid_gap` work list. The remaining
// labels are the class vocabulary Wikidata uses for these shapes rather than rows
// re-measured one by one — the gate is fail-closed, so a label this file gets
// wrong refuses rather than adopts.

Deno.test('the head of the real qid_gap batch is refused', () => {
  assertEquals(cityClassVerdict(['U.S. state']).verdict, 'refused')
  assertEquals(cityClassVerdict(['state of Australia']).verdict, 'refused')
  assertEquals(cityClassVerdict(['sovereign state', 'island country']).verdict, 'refused')
  assertEquals(cityClassVerdict(['historical region']).verdict, 'refused')
  assertEquals(cityClassVerdict(['island']).verdict, 'refused')
})

Deno.test('genuine settlements are adopted, spelled the way Wikidata spells them', () => {
  for (const label of [
    'city', 'big city', 'city of China', 'commune of France',
    'municipality of Brazil', 'town', 'village', 'urban-type settlement',
    'human settlement', 'city with county rights',
  ]) {
    assertEquals(cityClassVerdict([label]).verdict, 'settlement', label)
  }
})

// The dangerous shape: an entity carrying BOTH a settlement word and an
// administrative one. A plain whitelist adopts it on the settlement word alone.
Deno.test('the refuse override beats a settlement word in the same entity', () => {
  assertEquals(cityClassVerdict(['megacity', 'federal entity of Mexico']).verdict, 'refused')
  assertEquals(cityClassVerdict(['city-state']).verdict, 'refused')
  assertEquals(cityClassVerdict(['capital city', 'sovereign state']).verdict, 'refused')
  // ...and order must not matter: the override sweeps every label first.
  assertEquals(cityClassVerdict(['federal entity of Mexico', 'megacity']).verdict, 'refused')
})

// THE LOAD-BEARING DISTINCTION. Both refuse to adopt, but only `refused` may
// count an attempt toward the terminal sentinel. Collapsing them lets one
// Wikidata outage permanently write off every row the sweep touched.
Deno.test('unreadable class is undetermined, not refused', () => {
  const out = cityClassVerdict(null)
  assertEquals(out.verdict, 'undetermined')
  assertEquals(out.reason, 'class_unreadable')
})

Deno.test('an entity read successfully with no P31 is refused, not undetermined', () => {
  const out = cityClassVerdict([])
  assertEquals(out.verdict, 'refused')
  assertEquals(out.reason, 'no_class')
})

// A class we do not know refuses AND names itself, so a systematic gap in the
// vocabulary shows up as a rising count of labels rather than as silence.
Deno.test('an unrecognised class is refused and reports its label verbatim', () => {
  const out = cityClassVerdict(['exoplanet'])
  assertEquals(out.verdict, 'refused')
  assertEquals(out.reason, 'unrecognised')
  assertEquals(out.label, 'exoplanet')
})

Deno.test('scope list matches the selector and rejects anything else', () => {
  assertEquals([...CITY_REFRESH_SCOPES].sort(), [
    'alias_gap', 'all', 'content_first', 'content_only', 'qid_gap',
  ])
  // The two that had a cron and no seat at the table.
  assertEquals(isCityRefreshScope('qid_gap'), true)
  assertEquals(isCityRefreshScope('alias_gap'), true)
  assertEquals(isCityRefreshScope('content_first'), true)
  assertEquals(isCityRefreshScope(undefined), false)
  assertEquals(isCityRefreshScope('qid-gap'), false)
  assertEquals(isCityRefreshScope(''), false)
})
