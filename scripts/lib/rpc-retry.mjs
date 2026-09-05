/**
 * Classifying a failed PostgREST RPC call as transient or fatal.
 *
 * Written for `search_facets_parity_failures`, which intermittently exceeds the
 * 8 s `authenticator` statement_timeout and takes unrelated PRs red with it.
 * Measured: the same commit failed twice with 57014 and then passed on a plain
 * re-run in 8 s, while every other open PR passed the same gate minutes later —
 * the work is variable (cold cache / concurrent cron load on a disk-constrained
 * instance), not too large in principle. The migration that shipped the gate
 * recorded 1.63-1.73 s.
 *
 * WHY RETRY RATHER THAN RAISE THE CEILING: a function cannot raise its own
 * statement_timeout. The timer is armed when the TOP-LEVEL statement starts, so
 * a `SET` in the function body or its SET clause does not re-arm it — measured
 * on this cluster (a function that set 5 s then slept 9 s was never cancelled).
 * The only lever is the ROLE's timeout, and `authenticator` governs the entire
 * public API, so widening it to suit a CI gate would slacken every user-facing
 * query. That leaves fitting the work under the ceiling, or tolerating a
 * transient overrun. This is the latter.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: hide a real slowdown. A retry that
 * silently swallows the first timeout would turn a creeping regression in
 * `search_hybrid` — the live user search path this gate calls ten times — into
 * invisible CI latency. Every attempt is timed and reported by the caller, and
 * exhausting the attempts still fails the gate.
 */

/** PostgreSQL `query_canceled`. This is the statement_timeout being hit. */
export const STATEMENT_TIMEOUT_CODE = '57014';

/**
 * `transient` — worth another attempt; `fatal` — fail now, retrying cannot help.
 *
 * Deliberately NARROW. A 500 is only transient when the body names 57014: a 500
 * from a genuine SQL error (a bad cast, a missing column) is not improved by
 * asking again, and retrying it would just triple the time to a red build. The
 * gateway statuses are included because Supabase answers an overloaded pooler
 * with 502/503/504 rather than a Postgres error code.
 *
 * A 404 is explicitly fatal even though it looks incidental: PostgREST answers
 * an argument-NAME mismatch with PGRST202/404, so a retried 404 would quietly
 * re-ask a question the server will never understand.
 */
export function classifyRpcFailure(status, bodyText = '') {
  if (status === 408 || status === 429) return 'transient';
  if (status === 502 || status === 503 || status === 504) return 'transient';
  if (status === 500 && bodyText.includes(STATEMENT_TIMEOUT_CODE)) return 'transient';
  return 'fatal';
}

/**
 * Backoff in ms for attempt `n` (1-based). Linear, not exponential: the cause is
 * a busy instance rather than a rate limit, and the whole retry budget has to
 * stay well inside a CI step. 2 s, 4 s, 6 s.
 */
export function retryDelayMs(attempt) {
  return attempt * 2000;
}
