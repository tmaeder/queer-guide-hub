import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { orderByAttempt } from './ordering.ts'
import { pathOf } from './parse.ts'

/**
 * THE WEDGE THESE TESTS EXIST FOR, measured on prod 2026-10-01.
 *
 * Three consecutive runs of `source-gayout` reported SUCCESS with:
 *
 *     work_list 730, already_seen 353, pending 377,
 *     pages_fetched 16, parsed 0, date_unannounced 16
 *
 * A gayout page whose date is unannounced carries no `Event` block, so it
 * yields no row, is never "seen", and returns to the HEAD of `pending` on every
 * run. `index.ts` carried a comment claiming the page budget absorbed exactly
 * this — and it could not, because the run is stopped by the TIME budget long
 * before the page budget: the clock allows ~16 pages and the unparseable run at
 * the head is longer than that. The drain could never reach a parseable page
 * again, while every counter said success.
 *
 * No existing test could see it: `parse.test.ts` proves the parser reads a page
 * correctly, and the parser was never wrong. The defect was the ORDER pages were
 * handed to it in, which nothing tested because nothing was ordered.
 *
 * MUTATION-TESTED 4/4 KILLABLE, plus a comment-only control that correctly
 * SURVIVES. Removing the sort entirely fails 5 of 6 tests, so the ordering is
 * load-bearing rather than decorative.
 *
 * TWO MUTATIONS ARE UNKILLABLE IN THIS RUNTIME AND ARE NOT TEST GAPS. Recorded
 * so a later reader does not spend an afternoon chasing them:
 *
 *   1. `if (!ta && !tb) return 0` -> `return 1`. Measured: V8's sort leaves a
 *      32-element array untouched for BOTH `() => 0` and `() => 1`, so the two
 *      are behaviourally identical here. No assertion can distinguish them.
 *   2. `if (!tb) return 1` -> `return 0`. The surviving `if (!ta) return -1`
 *      branch already puts every fresh page ahead of every attempted one
 *      (verified directly), so that line is redundant under the current sort.
 *      It is KEPT anyway: a comparator that is not antisymmetric is a latent
 *      bug the day the runtime's sort changes.
 */

const w = (p: string) => ({ url: `https://www.gayout.com/${p}` })
const paths = (rows: { url: string }[]) => rows.map(r => pathOf(r.url))

Deno.test('a never-attempted page always outranks an attempted one', () => {
  const pending = [w('a'), w('b'), w('c')]
  const out = orderByAttempt(pending, { a: '2026-10-01T00:00:00Z', b: '2026-10-01T01:00:00Z' }, pathOf)
  assertEquals(paths(out)[0], 'c')
})

Deno.test('among attempted pages the oldest attempt comes first', () => {
  const pending = [w('newest'), w('oldest'), w('middle')]
  const out = orderByAttempt(pending, {
    newest: '2026-10-01T03:00:00Z',
    oldest: '2026-10-01T01:00:00Z',
    middle: '2026-10-01T02:00:00Z',
  }, pathOf)
  assertEquals(paths(out), ['oldest', 'middle', 'newest'])
})

Deno.test('with no attempts recorded the source order is preserved', () => {
  // Fail-open: an unreadable attempts map degrades to the old behaviour rather
  // than reshuffling the work list arbitrarily.
  //
  // LONG ENOUGH TO EXERCISE THE REAL SORT. A 3-item version of this test passed
  // even with the both-fresh comparator returning 1 instead of 0 — V8 sorts a
  // short array by binary insertion and can leave it untouched despite an
  // inconsistent comparator, so the mutation SURVIVED. 32 items forces the
  // merge path, where a non-zero comparison on equal keys actually reorders.
  const pending = Array.from({ length: 32 }, (_, i) => w(`p-${String(i).padStart(2, '0')}`))
  const expected = paths(pending)
  assertEquals(paths(orderByAttempt(pending, {}, pathOf)), expected)
})

Deno.test('a partially-attempted list keeps the source order within each group', () => {
  // Same stability requirement on the mixed case, which is the one that runs in
  // production: the fresh pages must stay in listing order among themselves.
  const pending = Array.from({ length: 24 }, (_, i) => w(`p-${String(i).padStart(2, '0')}`))
  const attempts: Record<string, string> = {}
  // stamp every third page as attempted
  pending.forEach((r, i) => {
    if (i % 3 === 0) attempts[pathOf(r.url)] = `2026-10-01T0${i % 10}:00:00Z`
  })
  const out = paths(orderByAttempt(pending, attempts, pathOf))
  const fresh = out.filter(p => !attempts[p])
  const freshInSourceOrder = paths(pending).filter(p => !attempts[p])
  assertEquals(fresh, freshInSourceOrder, 'fresh pages lost their listing order')
  // and every fresh page precedes every attempted one
  const lastFresh = out.findLastIndex(p => !attempts[p])
  const firstAttempted = out.findIndex(p => attempts[p])
  assert(lastFresh < firstAttempted, 'an attempted page sorted ahead of a fresh one')
})

Deno.test('THE REGRESSION: a head of unparseable pages no longer blocks the tail', () => {
  // Reproduces the measured shape: 20 unannounced pages at the head, then the
  // parseable ones. The clock only ever allows WINDOW pages per run.
  const WINDOW = 16
  const head = Array.from({ length: 20 }, (_, i) => w(`unannounced-${i}`))
  const tail = Array.from({ length: 5 }, (_, i) => w(`parseable-${i}`))
  const pending = [...head, ...tail]

  // BEFORE: fixed order. The window is entirely head, forever.
  const unorderedWindow = paths(pending).slice(0, WINDOW)
  assert(
    unorderedWindow.every(p => p.startsWith('unannounced-')),
    'control: in source order the window must be all-unannounced, or this test proves nothing',
  )

  // AFTER: simulate runs. Each run attempts its window; failures are stamped
  // and sort to the back, so a later run must reach the parseable tail.
  const attempts: Record<string, string> = {}
  let reached = -1
  for (let run = 0; run < 4 && reached < 0; run++) {
    const window = orderByAttempt(pending, attempts, pathOf).slice(0, WINDOW)
    if (paths(window).some(p => p.startsWith('parseable-'))) { reached = run; break }
    // every page in this window failed to parse
    for (const r of window) attempts[pathOf(r.url)] = `2026-10-01T0${run}:00:00Z`
  }
  assert(reached >= 0, 'the drain still never reaches a parseable page — the wedge is not fixed')
  assertEquals(reached, 1, 'with 20 unparseable pages and a 16-page window the tail is reached on run 2')
})

Deno.test('every pending page is eventually attempted', () => {
  // The property that actually matters: no page can be starved forever.
  const WINDOW = 10
  const pending = Array.from({ length: 57 }, (_, i) => w(`p-${i}`))
  const attempts: Record<string, string> = {}
  for (let run = 0; run < 12; run++) {
    const window = orderByAttempt(pending, attempts, pathOf).slice(0, WINDOW)
    for (const r of window) {
      attempts[pathOf(r.url)] = new Date(Date.UTC(2026, 9, 1, run)).toISOString()
    }
  }
  assertEquals(Object.keys(attempts).length, 57, 'some page was never attempted in 12 runs')
})
