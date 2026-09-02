import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  ACCESSIBILITY_CONTRADICTIONS,
  contradictionOf,
  isNegativeAccessibility,
  resolveContradictions,
} from './accessibility-vocab.ts'

Deno.test('every pair is [positive, negative] and the halves are disjoint', () => {
  // The ORDER is load-bearing: resolveContradictions keeps index 1. If a pair is
  // ever written the other way round, a venue that OSM says is not accessible
  // would publish "wheelchair accessible" — the exact harm this module exists to
  // prevent, and nothing else in the stack would catch it.
  const positives = ACCESSIBILITY_CONTRADICTIONS.map(([p]) => p)
  const negatives = ACCESSIBILITY_CONTRADICTIONS.map(([, n]) => n)
  for (const n of negatives) assertEquals(isNegativeAccessibility(n), true, `${n} must read as negative`)
  for (const p of positives) assertEquals(isNegativeAccessibility(p), false, `${p} must not read as negative`)
  assertEquals(positives.some((p) => negatives.includes(p)), false)
})

Deno.test('the pairing is symmetric — either side resolves to the other', () => {
  for (const [pos, neg] of ACCESSIBILITY_CONTRADICTIONS) {
    assertEquals(contradictionOf(pos), neg)
    assertEquals(contradictionOf(neg), pos)
  }
  assertEquals(contradictionOf('wifi'), undefined)
  assertEquals(contradictionOf('braille-menu'), undefined)
})

Deno.test('a contradicting pair resolves to the NEGATIVE and reports the conflict', () => {
  const r = resolveContradictions(
    ['wheelchair-accessible', 'not-wheelchair-accessible', 'braille-menu'],
    ACCESSIBILITY_CONTRADICTIONS,
  )
  assertEquals(r.resolved, ['braille-menu', 'not-wheelchair-accessible'])
  assertEquals(r.dropped, ['wheelchair-accessible'])
  assertEquals(r.conflicts, [['wheelchair-accessible', 'not-wheelchair-accessible']])
})

Deno.test('a lone value of either polarity is left completely alone', () => {
  // Absence of the opposite claim is not evidence — a bare `not-step-free` is a
  // measurement someone made and must survive intact.
  for (const v of ['wheelchair-accessible', 'not-step-free', 'no-accessible-restroom']) {
    const r = resolveContradictions([v], ACCESSIBILITY_CONTRADICTIONS)
    assertEquals(r.resolved, [v])
    assertEquals(r.dropped, [])
    assertEquals(r.conflicts, [])
  }
})

Deno.test('every declared pair is independently resolvable in one pass', () => {
  const all = ACCESSIBILITY_CONTRADICTIONS.flat()
  const r = resolveContradictions(all, ACCESSIBILITY_CONTRADICTIONS)
  assertEquals(r.resolved, ACCESSIBILITY_CONTRADICTIONS.map(([, n]) => n).sort())
  assertEquals(r.conflicts.length, ACCESSIBILITY_CONTRADICTIONS.length)
})

Deno.test('duplicates and blanks are normalised away without inventing a conflict', () => {
  const r = resolveContradictions(
    ['step-free-entrance', 'step-free-entrance', '', '  ', 'STEP-FREE-ENTRANCE'],
    ACCESSIBILITY_CONTRADICTIONS,
  )
  assertEquals(r.resolved, ['step-free-entrance'])
  assertEquals(r.conflicts, [])
})

Deno.test('resolution is idempotent — re-running on its own output changes nothing', () => {
  const once = resolveContradictions(
    ['accessible-restroom', 'no-accessible-restroom', 'hearing-loop'],
    ACCESSIBILITY_CONTRADICTIONS,
  )
  const twice = resolveContradictions(once.resolved, ACCESSIBILITY_CONTRADICTIONS)
  assertEquals(twice.resolved, once.resolved)
  assertEquals(twice.conflicts, [])
})
