import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  TRIPSIT_SLUG_MAP,
  TRIPSIT_STATUS_MAP,
  pairsFromCombos,
} from './tripsit-combos.ts'

// A miniature combos.json in the upstream shape: nested, both directions
// present, notes on one or both sides. Values are trimmed verbatim from the
// live file (2026-08-30).
const FIXTURE = {
  mdma: {
    maois: {
      note: 'MAOIs and MDMA can cause serotonin syndrome.',
      status: 'Dangerous',
    },
    cannabis: { status: 'Low Risk & Synergy' },
    mushrooms: { status: 'Caution' },
  },
  maois: {
    mdma: { status: 'Dangerous' },
    cannabis: { status: 'Low Risk & No Synergy' },
    mushrooms: { status: 'Dangerous' },
  },
  cannabis: {
    mdma: { note: 'Cannabis has an unpredictable synergy.', status: 'Low Risk & Synergy' },
    maois: { status: 'Low Risk & No Synergy' },
    mushrooms: { status: 'Caution' },
  },
  mushrooms: {
    mdma: { status: 'Caution' },
    maois: { status: 'Dangerous' },
    cannabis: { status: 'Caution' },
  },
}

Deno.test('collapses both directions to one row per unordered pair', () => {
  const r = pairsFromCombos(FIXTURE)
  assertEquals(r.substances, 4)
  assertEquals(r.directed, 12)
  assertEquals(r.pairs.length, 6)
  // 4 substances -> C(4,2) = 6, so nothing was dropped or doubled.
})

Deno.test('maps upstream keys through the explicit table, never by slug identity', () => {
  const r = pairsFromCombos(FIXTURE)
  const byPair = Object.fromEntries(r.pairs.map(p => [p.source_pair, p]))
  // `mushrooms` is the case the whole explicit map exists for: a slug
  // `mushrooms` DOES exist in unified_tags and is `deprecated`, so a
  // slug-equals-key fallback would resolve and render nowhere.
  assertEquals(byPair['mdma|mushrooms'].slug_b, 'psilocybin')
  assertEquals(byPair['cannabis|mushrooms'].slug_a, 'cannabis')
  assertEquals(byPair['cannabis|mushrooms'].slug_b, 'psilocybin')
})

Deno.test('an unknown upstream substance is reported, never guessed', () => {
  const r = pairsFromCombos({
    mdma: { kratom: { status: 'Caution' } },
    kratom: { mdma: { status: 'Caution' } },
  })
  assertEquals(r.pairs, [])
  assertEquals(r.unmappedKeys, ['kratom'])
})

Deno.test('an unknown severity label yields a null status, not `unknown`', () => {
  // `unknown` means "no rating published". Coercing a new upstream tier onto it
  // would turn a warning into a shrug; the caller leaves the stored row alone.
  const r = pairsFromCombos({
    mdma: { maois: { status: 'Extreme Danger' } },
    maois: { mdma: { status: 'Extreme Danger' } },
  })
  assertEquals(r.pairs.length, 1)
  assertEquals(r.pairs[0].status, null)
  assertEquals(r.unmappedStatuses, ['Extreme Danger'])
})

Deno.test('a cross-direction status disagreement keeps the WORSE rating and reports it', () => {
  const r = pairsFromCombos({
    mdma: { maois: { status: 'Caution' } },
    maois: { mdma: { status: 'Dangerous' } },
  })
  assertEquals(r.pairs[0].status, 'dangerous')
  assertEquals(r.disagreements.length, 1)
  assertEquals(r.disagreements[0].pair, 'maois|mdma')
  assertEquals(r.disagreements[0].kept, 'dangerous')
})

Deno.test('note selection is deterministic — the sorted-first direction wins', () => {
  // Two upstream pairs really do carry different prose per direction, and the
  // 2026-09 import took one of each with no rule. Without a rule the kept note
  // depends on object iteration order, which would flap `updated_at` on runs
  // that changed nothing.
  const a = pairsFromCombos({
    cannabis: { mdma: { status: 'Caution', note: 'cannabis-side' } },
    mdma: { cannabis: { status: 'Caution', note: 'mdma-side' } },
  })
  const b = pairsFromCombos({
    mdma: { cannabis: { status: 'Caution', note: 'mdma-side' } },
    cannabis: { mdma: { status: 'Caution', note: 'cannabis-side' } },
  })
  assertEquals(a.pairs[0].note, 'cannabis-side')
  assertEquals(b.pairs[0].note, 'cannabis-side')
  assertEquals(a.pairs[0].source_pair, 'cannabis|mdma')
})

Deno.test('a note present in only one direction is kept', () => {
  const r = pairsFromCombos({
    cannabis: { mdma: { status: 'Caution' } },
    mdma: { cannabis: { status: 'Caution', note: 'only here' } },
  })
  assertEquals(r.pairs[0].note, 'only here')
})

Deno.test('output ordering is stable regardless of input key order', () => {
  const forward = pairsFromCombos(FIXTURE)
  const shuffled = pairsFromCombos(
    Object.fromEntries(Object.entries(FIXTURE).reverse()) as typeof FIXTURE,
  )
  assertEquals(
    forward.pairs.map(p => p.source_pair),
    shuffled.pairs.map(p => p.source_pair),
  )
})

Deno.test('an empty or non-object document throws rather than reading as an empty matrix', () => {
  // The Overpass lesson: a well-formed response with nothing in it is not an
  // answer, and here it would be read as upstream retracting every warning.
  assertThrows(() => pairsFromCombos({}))
  assertThrows(() => pairsFromCombos([]))
  assertThrows(() => pairsFromCombos(null))
  assertThrows(() => pairsFromCombos('nope'))
})

Deno.test('a substance combined with itself is not a pair', () => {
  const r = pairsFromCombos({ mdma: { mdma: { status: 'Caution' }, maois: { status: 'Dangerous' } } })
  assertEquals(r.pairs.length, 1)
  assertEquals(r.pairs[0].source_pair, 'maois|mdma')
})

Deno.test('every status the map emits is a value the CHECK constraint accepts', () => {
  // Mirrors substance_interactions_status_check. `unknown` is deliberately not
  // producible from upstream: it means "no rating published", which is our
  // state, not TripSit's.
  const allowed = new Set([
    'dangerous', 'unsafe', 'caution',
    'low_risk_decrease', 'low_risk_no_synergy', 'low_risk_synergy', 'unknown',
  ])
  for (const key of Object.values(TRIPSIT_STATUS_MAP)) {
    assertEquals(allowed.has(key), true, `status key ${key} is not in the CHECK constraint`)
  }
  assertEquals(Object.values(TRIPSIT_STATUS_MAP).includes('unknown'), false)
})

Deno.test('the slug map covers the whole upstream vocabulary exactly once each way', () => {
  const keys = Object.keys(TRIPSIT_SLUG_MAP)
  const slugs = Object.values(TRIPSIT_SLUG_MAP)
  assertEquals(keys.length, 31)
  // Two upstream keys resolving to one tag would violate the canonical-order
  // CHECK (tag_a_id < tag_b_id) rather than fail quietly.
  assertEquals(new Set(slugs).size, slugs.length)
})
