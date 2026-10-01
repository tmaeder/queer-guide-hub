/** Work-list ordering for source-gayout.
 *
 *  SEPARATE MODULE ON PURPOSE. Importing `index.ts` pulls in the handler and
 *  therefore `_shared/sentry.ts`, whose npm dependency is not installed in the
 *  Deno test environment — so a test that imports the handler cannot run at all
 *  under `npm run test:functions`. The pride rules were extracted from
 *  `pipeline-validate` for exactly this reason (#3995); same shape here.
 */

/** `{ gayout path: ISO timestamp of a fetch that produced NO event }` */
export type PageAttempts = Record<string, string>

/** Never-attempted paths first, then least-recently-attempted.
 *
 *  WHY ORDERING IS A CORRECTNESS GUARD, NOT A TUNING KNOB. A gayout page whose
 *  date is unannounced carries no `Event` block, so it yields no row, is never
 *  "seen", and returns to the HEAD of the pending list on every run. The page
 *  budget in `index.ts` was written to absorb that and CANNOT, because the run
 *  is stopped by the TIME budget long before the page budget is reached.
 *  Measured on prod 2026-10-01: three consecutive runs fetched 16 pages, parsed
 *  0, and reported success while 377 urls waited — the clock allows ~16 pages
 *  and the unparseable run at the head was longer than that, so the drain could
 *  never reach a parseable page again.
 *
 *  This is the ordering `get_stale_embeddings` already uses for the same reason
 *  (migration 20260927123000): a row that keeps failing moves to the BACK,
 *  which is what bounds the backlog.
 *
 *  Stable: with no attempts recorded the source's own order is preserved, so an
 *  unreadable attempts map degrades to the previous behaviour rather than
 *  reshuffling the work list arbitrarily.
 */
export function orderByAttempt<T extends { url: string }>(
  pending: T[],
  attempts: PageAttempts,
  path: (url: string) => string,
): T[] {
  return [...pending].sort((a, b) => {
    const ta = attempts[path(a.url)]
    const tb = attempts[path(b.url)]
    if (!ta && !tb) return 0 // both fresh: keep the source's own order
    if (!ta) return -1 // never attempted wins
    if (!tb) return 1
    return ta < tb ? -1 : ta > tb ? 1 : 0 // oldest attempt first
  })
}
