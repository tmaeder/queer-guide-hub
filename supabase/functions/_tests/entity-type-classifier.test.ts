// Unit tests for the per-row CSV entity-type classifier (Issue #113).
// Run with: cd supabase/functions && deno test _tests/entity-type-classifier.test.ts
import { assertEquals } from 'jsr:@std/assert'
import {
  classifyEntityType,
  entityTypeToTable,
  routeRows,
} from '../_shared/entity-type-classifier.ts'

Deno.test('explicit _entity_type hint wins', () => {
  const r = classifyEntityType({ name: 'Some Bar', _entity_type: 'venue' })
  assertEquals(r.entityType, 'venue')
  assertEquals(r.fromHint, true)
})

Deno.test('explicit hint accepts aliases (person/people/business)', () => {
  assertEquals(classifyEntityType({ name: 'X', _entity_type: 'person' }).entityType, 'personality')
  assertEquals(classifyEntityType({ name: 'X', _entity_type: 'people' }).entityType, 'personality')
  assertEquals(classifyEntityType({ name: 'X', _entity_type: 'business' }).entityType, 'venue')
  assertEquals(classifyEntityType({ name: 'X', _entity_type: 'category' }).entityType, 'tag')
})

Deno.test('unknown hint string is ignored, falls through to heuristics', () => {
  const r = classifyEntityType({ name: 'Lytton Strachey', _entity_type: 'foo', birth_date: '1880-03-01' })
  assertEquals(r.fromHint, false)
  assertEquals(r.entityType, 'personality')
})

Deno.test('person markers (birth_date) → personality', () => {
  const r = classifyEntityType({ name: 'Lytton Strachey', birth_date: '1880-03-01' })
  assertEquals(r.entityType, 'personality')
})

Deno.test('person markers (wikidata_qid) → personality', () => {
  const r = classifyEntityType({ name: 'Davis Mac-Iyalla', wikidata_qid: 'Q123456' })
  assertEquals(r.entityType, 'personality')
})

Deno.test('event markers (start_date) → event', () => {
  const r = classifyEntityType({ name: 'Berlin Pride 2026', start_date: '2026-07-25' })
  assertEquals(r.entityType, 'event')
})

Deno.test('venue language in name → venue (no markers)', () => {
  const r = classifyEntityType({ name: 'Sauna Tres Chic' })
  assertEquals(r.entityType, 'venue')
})

Deno.test('venue language in bio → venue', () => {
  const r = classifyEntityType({
    name: 'InTeam Club',
    description: 'Late-night cruising bar with a darkroom',
  })
  assertEquals(r.entityType, 'venue')
})

Deno.test('address column → venue (Issue #113 — defends against personality routing)', () => {
  const r = classifyEntityType({ name: 'ES Collection Flagship', address: '123 Calle Mayor' })
  assertEquals(r.entityType, 'venue')
})

Deno.test('numeric/postcode junk → unknown', () => {
  assertEquals(classifyEntityType({ name: '344' }).entityType, 'unknown')
  assertEquals(classifyEntityType({ name: '417' }).entityType, 'unknown')
  assertEquals(classifyEntityType({ name: 'BN2 1TH' }).entityType, 'unknown')
})

Deno.test('empty/very short name → unknown', () => {
  assertEquals(classifyEntityType({ name: '' }).entityType, 'unknown')
  assertEquals(classifyEntityType({ name: 'X' }).entityType, 'unknown')
  assertEquals(classifyEntityType({}).entityType, 'unknown')
})

Deno.test('glossary-style entries with no markers → unknown', () => {
  // Short slang terms like "DILF" / "fag hag" / "egg" — no person markers,
  // not venue language, no event date. Should fall back to job-level type.
  const r = classifyEntityType({ name: 'cottaging', description: 'a slang term' })
  assertEquals(r.entityType, 'unknown')
})

Deno.test('person language in bio → personality (no structural markers)', () => {
  const r = classifyEntityType({
    name: 'Some Author',
    description: 'British novelist and activist, born in London',
  })
  assertEquals(r.entityType, 'personality')
})

Deno.test('entityTypeToTable maps types correctly', () => {
  assertEquals(entityTypeToTable('personality'), 'personalities')
  assertEquals(entityTypeToTable('venue'), 'venues')
  assertEquals(entityTypeToTable('event'), 'events')
  assertEquals(entityTypeToTable('tag'), 'unified_tags')
  assertEquals(entityTypeToTable('unknown'), '')
  assertEquals(entityTypeToTable('bogus'), '')
})

Deno.test('routeRows groups mixed-type batch and falls back unknowns', () => {
  type R = { id: string; data: Record<string, unknown> }
  const items: R[] = [
    { id: 'p1', data: { name: 'Lytton Strachey', birth_date: '1880-03-01' } },
    { id: 'p2', data: { name: 'Davis Mac-Iyalla', profession: 'activist' } },
    { id: 'v1', data: { name: 'Sauna Tres Chic' } },
    { id: 'v2', data: { name: 'InTeam Club', description: 'darkroom and cruising bar' } },
    { id: 'e1', data: { name: 'Berlin Pride 2026', start_date: '2026-07-25' } },
    { id: 'u1', data: { name: '344' } },
    { id: 'u2', data: { name: 'DILF' } },
  ]
  const groups = routeRows(
    items,
    r => ({ row: r.data, sourceId: r.id }),
    { entityType: 'personality', targetTable: 'personalities' },
  )
  const byType = Object.fromEntries(groups.map(g => [g.entityType, g]))
  assertEquals(byType.personality.items.length, 2)
  assertEquals(byType.personality.targetTable, 'personalities')
  assertEquals(byType.venue.items.length, 2)
  assertEquals(byType.venue.targetTable, 'venues')
  assertEquals(byType.event.items.length, 1)
  assertEquals(byType.event.targetTable, 'events')
  // Junk + glossary both fall back to the job-level type
  assertEquals(byType.fallback.items.length, 2)
  assertEquals(byType.fallback.targetTable, 'personalities')
})

Deno.test('routeRows: unknown items fall back to caller table verbatim', () => {
  type R = { id: string; data: Record<string, unknown> }
  const items: R[] = [
    { id: 'a', data: { name: 'X' } }, // too short → unknown
    { id: 'b', data: { name: '' } }, // empty → unknown
  ]
  const groups = routeRows(
    items,
    r => ({ row: r.data, sourceId: r.id }),
    { entityType: 'tag', targetTable: 'unified_tags' },
  )
  assertEquals(groups.length, 1)
  assertEquals(groups[0].entityType, 'fallback')
  assertEquals(groups[0].targetTable, 'unified_tags')
  assertEquals(groups[0].items.length, 2)
})

Deno.test('Issue #113 incident sample is routed correctly', () => {
  // Sample taken from the incident report in #113. With per-row routing,
  // each of these should land on the correct entity type instead of all
  // ending up as personalities.
  const cases: { row: Record<string, unknown>; expected: string }[] = [
    { row: { name: 'Lytton Strachey', birth_date: '1880-03-01' }, expected: 'personality' },
    { row: { name: 'Davis Mac-Iyalla', profession: 'activist' }, expected: 'personality' },
    { row: { name: 'Sauna Tres Chic' }, expected: 'venue' },
    { row: { name: 'InTeam Club', description: 'darkroom and cruising bar' }, expected: 'venue' },
    { row: { name: 'ES Collection Flagship', address: 'Calle Mayor 1' }, expected: 'venue' },
    { row: { name: 'Eurovisex Sex Shop' }, expected: 'venue' },
    { row: { name: '344' }, expected: 'unknown' },
    { row: { name: '417' }, expected: 'unknown' },
    { row: { name: 'BN2 1TH' }, expected: 'unknown' },
    { row: { name: 'DILF' }, expected: 'unknown' },
    { row: { name: 'fag hag' }, expected: 'unknown' },
  ]
  for (const c of cases) {
    const got = classifyEntityType(c.row).entityType
    assertEquals(got, c.expected, `expected ${JSON.stringify(c.row)} → ${c.expected}, got ${got}`)
  }
})
