import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mergeFieldProv } from './field-provenance.ts'

/**
 * These fixtures are the real shapes from prod, not invented ones: the `fused`
 * object is exactly what `fuse()` in city-corroboration returns, and the
 * `retracted` entry is what 20360201100100 wrote.
 */

const fused = {
  candidates: [{ source: 'wikidata', value: 105.4 }],
  value: 105.4,
  confidence: 0.6,
  sources: ['wikidata'],
  corroborated: false,
  conflict: false,
}

Deno.test('a retraction record survives a corroboration pass', () => {
  // The whole reason this module exists. Before the fix this key was deleted
  // nightly: area markers went 181 -> 129 in one day, with zero refills.
  const stored = {
    candidates: [{ source: 'wikidata', value: 999 }],
    retracted: { value: 825290000, reason: 'implausible_area', at: '2026-09-08T18:18:00Z' },
  }
  const out = mergeFieldProv(stored, fused)
  assertEquals(out.retracted, stored.retracted)
})

Deno.test('recomputed keys win over the stored ones', () => {
  const stored = { value: 999, confidence: 0.1, sources: ['stale'], corroborated: true }
  const out = mergeFieldProv(stored, fused)
  assertEquals(out.value, 105.4)
  assertEquals(out.confidence, 0.6)
  assertEquals(out.sources, ['wikidata'])
  assertEquals(out.corroborated, false)
})

Deno.test('candidates are REPLACED, never unioned', () => {
  // A deep merge would resurrect a source that no longer asserts anything. The
  // fuser rebuilds this array wholesale and must be free to shrink it.
  const stored = { candidates: [{ source: 'osm', value: 1 }, { source: 'wikidata', value: 2 }] }
  const out = mergeFieldProv(stored, fused) as typeof fused
  assertEquals(out.candidates.length, 1)
  assertEquals(out.candidates[0].source, 'wikidata')
})

Deno.test('a missing or null stored entry is not an error', () => {
  assertEquals(mergeFieldProv(undefined, fused), fused)
  assertEquals(mergeFieldProv(null, fused), fused)
  assertEquals(mergeFieldProv({}, fused), fused)
})

Deno.test('a non-object stored entry is discarded, not spread', () => {
  // This is jsonb from Postgres and nothing guarantees its shape. Spreading a
  // string yields {0:'a',1:'b',...} and an array yields numeric keys — both
  // corrupt the entry silently rather than failing.
  assertEquals(mergeFieldProv('oops', fused), fused)
  assertEquals(mergeFieldProv(42, fused), fused)
  assertEquals(mergeFieldProv([{ source: 'x' }], fused), fused)
})

Deno.test('unrelated stamps from other writers survive', () => {
  // run_event_geo_fill's `source: 'derived:city_centroid'` is the same class of
  // casualty — 141 events lost theirs to the events-side variant of this bug.
  const stored = { source: 'derived:city_centroid', human_override: { by: 'admin' } }
  const out = mergeFieldProv(stored, fused)
  assertEquals(out.source, 'derived:city_centroid')
  assertEquals(out.human_override, { by: 'admin' })
})
