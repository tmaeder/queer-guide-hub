import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { canonicalJson, loadReviewQueueGuard } from './review-queue-guard.ts'

// A minimal stand-in for the PostgREST builder chain the guard uses:
//   .from(view).select(cols).eq('status', s).in('field', f).in(idCol, ids)  -> {data, error}
// Each call records the filters so a test can assert the read was scoped.
type Row = Record<string, unknown>
interface Capture {
  view: string
  select: string
  status?: string
  ins: Record<string, unknown[]>
}

function fakeClient(
  byStatus: Record<string, Row[] | { error: string }>,
  captures: Capture[] = [],
) {
  return {
    from(view: string) {
      const cap: Capture = { view, select: '', ins: {} }
      captures.push(cap)
      const builder = {
        select(cols: string) { cap.select = cols; return builder },
        eq(col: string, val: string) { if (col === 'status') cap.status = val; return builder },
        in(col: string, vals: unknown[]) { cap.ins[col] = vals; return builder },
        then(res: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) {
          const hit = byStatus[cap.status ?? '']
          if (hit && !Array.isArray(hit)) return Promise.resolve(res({ data: null, error: { message: hit.error } }))
          return Promise.resolve(res({ data: (hit as Row[]) ?? [], error: null }))
        },
      }
      return builder
    },
    // The fake implements only the four builder methods the guard calls, so it is not a
    // structural SupabaseClient. `unknown` narrows through without `any`, which keeps the
    // cast from silently accepting a fake that has drifted into a different shape.
  } as unknown as SupabaseClient
}

const OPTS = {
  view: 'venue_review_queue',
  idColumn: 'venue_id',
  fields: ['accessibility_attributes', 'accessibility_notes'] as const,
  ids: ['v1', 'v2'],
}

Deno.test('canonicalJson is stable against jsonb key reordering', () => {
  // This is the whole reason the guard can match a stored row at all: jsonb sorts keys by
  // length then bytewise, so the order we wrote is never the order we read back.
  const written = { subcategory: 'Underwear', from_rating: 'adult', to_rank: 2, rationale: 'x' }
  const readBack = { to_rank: 2, rationale: 'x', from_rating: 'adult', subcategory: 'Underwear' }
  assertEquals(canonicalJson(written), canonicalJson(readBack))
  assertEquals(JSON.stringify(written) === JSON.stringify(readBack), false)
})

Deno.test('canonicalJson sorts nested keys but preserves array order', () => {
  assertEquals(
    canonicalJson({ a: { z: 1, y: 2 } }),
    canonicalJson({ a: { y: 2, z: 1 } }),
  )
  // Array order is part of the value and must NOT be normalised away.
  assertEquals(canonicalJson(['b', 'a']) === canonicalJson(['a', 'b']), false)
})

Deno.test('blocks an open proposal regardless of value', () => {
  return loadReviewQueueGuard(
    fakeClient({ open: [{ venue_id: 'v1', field: 'accessibility_attributes' }], rejected: [] }),
    OPTS,
  ).then((g) => {
    assertEquals(g.blocked('v1', 'accessibility_attributes', { anything: true }), 'open')
    assertEquals(g.blocked('v1', 'accessibility_notes', {}), null)
    assertEquals(g.blocked('v2', 'accessibility_attributes', {}), null)
    assertEquals(g.precheckFailed, false)
  })
})

Deno.test('blocks a REJECTED proposal only when the value matches', async () => {
  const g = await loadReviewQueueGuard(
    fakeClient({
      open: [],
      // Stored the way jsonb hands it back: keys in a different order than written.
      rejected: [{
        venue_id: 'v1',
        field: 'accessibility_attributes',
        proposed_value: { osm: ['a'], value: ['wheelchair-accessible'] },
      }],
    }),
    OPTS,
  )
  // Same claim, written in the producer's key order -> blocked.
  assertEquals(
    g.blocked('v1', 'accessibility_attributes', { value: ['wheelchair-accessible'], osm: ['a'] }),
    'rejected',
  )
  // A genuinely different proposal is NOT suppressed — this is what keeps the fix from
  // silencing a re-proposal after the evidence actually changed.
  assertEquals(
    g.blocked('v1', 'accessibility_attributes', { value: ['not-wheelchair-accessible'], osm: ['a'] }),
    null,
  )
})

Deno.test('a rejection on one field does not block another field', async () => {
  const g = await loadReviewQueueGuard(
    fakeClient({
      open: [],
      rejected: [{ venue_id: 'v1', field: 'accessibility_attributes', proposed_value: { value: 1 } }],
    }),
    OPTS,
  )
  assertEquals(g.blocked('v1', 'accessibility_notes', { value: 1 }), null)
})

Deno.test('markQueued stops a second proposal in the same run', async () => {
  const g = await loadReviewQueueGuard(fakeClient({ open: [], rejected: [] }), OPTS)
  assertEquals(g.blocked('v1', 'accessibility_attributes', { v: 1 }), null)
  g.markQueued('v1', 'accessibility_attributes')
  assertEquals(g.blocked('v1', 'accessibility_attributes', { v: 1 }), 'open')
})

Deno.test('a failed OPEN read declines to answer rather than saying "nothing is queued"', async () => {
  const g = await loadReviewQueueGuard(
    fakeClient({ open: { error: 'boom' }, rejected: [] }),
    OPTS,
  )
  assertEquals(g.precheckFailed, true)
  // Not blocked -> the insert is attempted and uq_erq_open refuses the duplicate. The
  // alternative (treating the failure as an empty queue and trusting it) is the defect
  // this guard exists to remove, one layer down.
  assertEquals(g.blocked('v1', 'accessibility_attributes', { v: 1 }), null)
})

Deno.test('a failed REJECTED read is reported — it has no database backstop', async () => {
  const g = await loadReviewQueueGuard(
    fakeClient({ open: [], rejected: { error: 'boom' } }),
    OPTS,
  )
  assertEquals(g.precheckFailed, true)
  assertEquals(g.blocked('v1', 'accessibility_attributes', { v: 1 }), null)
})

Deno.test('no ids means no reads at all', async () => {
  const captures: Capture[] = []
  const g = await loadReviewQueueGuard(
    fakeClient({ open: [], rejected: [] }, captures),
    { ...OPTS, ids: [] },
  )
  assertEquals(captures.length, 0)
  assertEquals(g.precheckFailed, false)
})

Deno.test('both reads are scoped to status, the gated fields and this run', async () => {
  const captures: Capture[] = []
  await loadReviewQueueGuard(fakeClient({ open: [], rejected: [] }, captures), OPTS)
  assertEquals(captures.length, 2)
  assertEquals(captures.map((c) => c.status).sort(), ['open', 'rejected'])
  for (const c of captures) {
    assertEquals(c.view, 'venue_review_queue')
    assertEquals(c.ins.field, ['accessibility_attributes', 'accessibility_notes'])
    assertEquals(c.ins.venue_id, ['v1', 'v2'])
  }
  // Only the rejected read needs the value; asking for it on both would be wasted bytes.
  const rejected = captures.find((c) => c.status === 'rejected')!
  assertEquals(rejected.select.includes('proposed_value'), true)
  const open = captures.find((c) => c.status === 'open')!
  assertEquals(open.select.includes('proposed_value'), false)
})

// --- normalizeValue ---------------------------------------------------------
// Value equality over the WHOLE payload is the right key only when the payload is
// structured. `city.lgbt_friendly_rating` is `{value, scale, rationale}` where the
// rationale is free LLM prose rewritten on every run, so a rejection could never
// suppress a re-proposal. Measured on prod 2026-10-03: Khandwa was re-offered rating 3
// two days after that exact value was rejected, with a reworded rationale.

const RATING_OPTS = {
  view: 'city_review_queue',
  idColumn: 'city_id',
  fields: ['lgbt_friendly_rating', 'editorial_hook'] as const,
  ids: ['c1'],
  normalizeValue: (field: string, value: unknown) => {
    if (field !== 'lgbt_friendly_rating') return value
    const v = (value ?? {}) as Record<string, unknown>
    return { value: v.value, scale: v.scale }
  },
}

// The two payloads differ ONLY in the prose. This is the real prod pair.
const REJECTED_RATING = {
  city_id: 'c1',
  field: 'lgbt_friendly_rating',
  proposed_value: {
    value: 3, scale: '1-5',
    rationale: 'India has a national equality score of 77 and same-sex relations are legal, but no statewide protections exist in Madhya Pradesh.',
  },
}
const REWORDED_RATING = {
  value: 3, scale: '1-5',
  rationale: 'India has legal same-sex relations and an equality score of 77/100, indicating moderate legal protections but ongoing social challenges.',
}

Deno.test('a rejected rating stays rejected when only the rationale is reworded', async () => {
  const guard = await loadReviewQueueGuard(
    fakeClient({ open: [], rejected: [REJECTED_RATING] }), RATING_OPTS,
  )
  assertEquals(guard.blocked('c1', 'lgbt_friendly_rating', REWORDED_RATING), 'rejected')
})

Deno.test('without the normalizer the SAME pair is NOT caught — this is the defect', async () => {
  // The control that proves the normalizer is load-bearing rather than decoration: drop
  // it and the identical inputs sail through, which is exactly what prod did.
  const { normalizeValue: _drop, ...bare } = RATING_OPTS
  const guard = await loadReviewQueueGuard(
    fakeClient({ open: [], rejected: [REJECTED_RATING] }), bare,
  )
  assertEquals(guard.blocked('c1', 'lgbt_friendly_rating', REWORDED_RATING), null)
})

Deno.test('a genuinely CHANGED rating is still free to reach a human', async () => {
  // The normalizer must not collapse 3 and 4 into "a rating was rejected once".
  const guard = await loadReviewQueueGuard(
    fakeClient({ open: [], rejected: [REJECTED_RATING] }), RATING_OPTS,
  )
  assertEquals(guard.blocked('c1', 'lgbt_friendly_rating', { ...REWORDED_RATING, value: 4 }), null)
})

Deno.test('prose fields keep byte equality — a hook IS its prose', async () => {
  const rejectedHook = {
    city_id: 'c1', field: 'editorial_hook',
    proposed_value: { value: 'Railway junction with rich history' },
  }
  const guard = await loadReviewQueueGuard(
    fakeClient({ open: [], rejected: [rejectedHook] }), RATING_OPTS,
  )
  // Identical hook: suppressed.
  assertEquals(guard.blocked('c1', 'editorial_hook', { value: 'Railway junction with rich history' }), 'rejected')
  // Reworded hook: a different proposal, so it must NOT be suppressed.
  assertEquals(guard.blocked('c1', 'editorial_hook', { value: 'Khandwa, where Kishore Kumar grew up.' }), null)
})
