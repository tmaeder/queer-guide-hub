import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { _internals } from './entity-link.ts'

const { trigramSimilarity, passesDisambiguationGuard } = _internals

Deno.test('trigramSimilarity exact match = 1', () => {
  assertEquals(trigramSimilarity('berlin', 'berlin'), 1)
})

Deno.test('trigramSimilarity catches small typos', () => {
  assert(trigramSimilarity('berlim', 'berlin') > 0.6)
})

Deno.test('trigramSimilarity rejects unrelated', () => {
  assert(trigramSimilarity('berlin', 'tokyo') < 0.3)
})

Deno.test('Georgia disambiguation: blocks without country context', () => {
  const r = passesDisambiguationGuard('country', 'Georgia',
    'A new law in the state of Georgia takes effect Monday, Atlanta lawmakers said.')
  assertFalse(r.ok)
  assert(r.reason?.includes('Georgia'))
})

Deno.test('Georgia disambiguation: passes with Tbilisi context', () => {
  const r = passesDisambiguationGuard('country', 'Georgia',
    'In Tbilisi, the Georgian government announced new restrictions.')
  assert(r.ok)
})

Deno.test('Disambiguation only applies to countries, not cities', () => {
  const r = passesDisambiguationGuard('city', 'Georgia',
    'Random body without any disambiguation hints.')
  assert(r.ok)
})
