/**
 * Guards the two faults triaged on 2026-08-30 in `source-eventbrite` and
 * `source-foursquare`.
 *
 * Both wrapped each `withCircuitBreaker` call in a per-item `try/catch` that
 * only `console.error`s, then returned `{success:true, items:0}` at HTTP 200.
 * `recordFailure` has already run inside the breaker by then, so the two layers
 * disagreed by construction. Measured on prod, from one 12:30 cron firing:
 *
 *   api_circuit_breakers.eventbrite   500 failures, open, last_failure 12:30:04
 *   admin_automation_runs             status='success', 12:32:00
 *
 * A 200 RESETS `consecutive_failures`, so `auto_pause_threshold = 3` was
 * structurally unreachable and `ev_fill_eventbrite` stayed enabled through 500
 * consecutive failures. `source-awin` is the control that proves the mechanism:
 * identical adapter shape, but its breaker call is not inside a per-item catch,
 * so the throw reaches the handler, it returns 500 — and it auto-paused at 33.
 * Same family as `airport-service-refresh-error-hygiene.test.ts` ("false-green
 * run tracking"), reached by a different route.
 *
 * Scope is these two files: the same swallow shape exists in other `source-*`
 * functions, and unpicking each needs a per-source decision about which partial
 * failures are normal. A repo-wide assertion here would be one that cannot
 * pass. These are the two that were actually audited.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const EVENTBRITE = 'source-eventbrite/index.ts'
const FOURSQUARE = 'source-foursquare/index.ts'
const AWIN = 'source-awin/index.ts'

// Strip comments so prose about the bug never satisfies or trips a check.
//
// The `[^:]` guard is load-bearing and was found by mutation-testing this file:
// a line-comment pattern without it also eats the double slash in "https://",
// which silently deleted EB_BASE and made the "still points at the dead
// endpoint" assertion vacuous — it passed with RETIRED flipped to false, i.e.
// it guarded nothing.
//
// Line comments, not a JSDoc block: the pattern being described contains the
// characters that close a block comment, which ends it early and turns the rest
// of the prose into a syntax error.
function code(src: string): string {
  return src.replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
}

async function source(path: string): Promise<string> {
  return code(await Deno.readTextFile(path))
}

Deno.test('source-eventbrite stays retired while it points at the dead endpoint', async () => {
  const src = await source(EVENTBRITE)

  // The endpoint 404s with and without credentials — Eventbrite removed public
  // event search from v3 and there is no successor. Reviving the function
  // without changing the URL only restarts the 404 loop.
  const stillDeadUrl = /eventbriteapi\.com\/v3\/events\/search/.test(src)
  const retired = /const\s+RETIRED\s*=\s*true/.test(src)

  if (stillDeadUrl && !retired) {
    throw new Error(
      `${EVENTBRITE}: RETIRED is no longer true while EB_BASE still points at ` +
        `/v3/events/search/, which returns HTTP 404 NOT_FOUND regardless of auth. ` +
        `Repoint the URL at a real endpoint before flipping the flag.`,
    )
  }
  assertEquals(retired || !stillDeadUrl, true)
})

Deno.test('source-eventbrite returns before it can touch the circuit breaker', async () => {
  const src = await source(EVENTBRITE)
  // The guard must sit ahead of the breaker call inside fetch(), otherwise a DAG
  // invocation keeps burning failures even with the cron retired.
  const guard = src.indexOf('if (RETIRED) return []')
  // The CALL site, not the identifier: `withCircuitBreaker` also appears in the
  // import on line 2, which trivially precedes everything.
  const breaker = src.search(/withCircuitBreaker\s*\(/)
  if (guard === -1) throw new Error(`${EVENTBRITE}: lost the early return in fetch()`)
  if (breaker !== -1 && guard > breaker) {
    throw new Error(`${EVENTBRITE}: the RETIRED guard no longer precedes withCircuitBreaker`)
  }
})

Deno.test('source-foursquare never throws a credential rejection inside the breaker', async () => {
  const src = await source(FOURSQUARE)

  // Everything between withCircuitBreaker( and the matching handler tail. A
  // `throw` on a 401/403 here runs recordFailure before the handler can classify
  // it as a skipped credential problem — that is the whole 350-failure bug.
  const start = src.indexOf('withCircuitBreaker')
  if (start === -1) throw new Error(`${FOURSQUARE}: breaker call disappeared`)
  const body = src.slice(start, src.indexOf('for (const place of', start))

  const throwsOnAuth = /if\s*\(\s*res\.status\s*===\s*(401|403)[\s\S]{0,80}?throw\b/.test(body)
  assertEquals(
    throwsOnAuth,
    false,
    `${FOURSQUARE}: a 401/403 is thrown from inside withCircuitBreaker again. ` +
      `Return a sentinel and raise InvalidCredentialsError outside the breaker, ` +
      `or every rejected key records an API failure that nothing can take back.`,
  )

  // And the rejection must still be surfaced — as a type, not a substring match
  // on the message ('.includes("401")' also matched unrelated upstream text).
  assertEquals(/InvalidCredentialsError/.test(src), true, `${FOURSQUARE}: no typed credential rejection`)
  assertEquals(
    /message\??\.?\s*\.includes\(['"]401['"]\)/.test(src),
    false,
    `${FOURSQUARE}: back to substring-matching '401' on an error message`,
  )
})

Deno.test('source-foursquare surfaces a total upstream failure instead of 200 success', async () => {
  const src = await source(FOURSQUARE)

  // Partial failure must still return its rows; only all-failed-and-nothing-
  // fetched escalates, so one bad city cannot discard nineteen good ones.
  const hasCounters = /failures\s*\+\+/.test(src) && /attempts\s*\+\+/.test(src)
  const escalates = /failures\s*===\s*attempts[\s\S]{0,160}?throw\b/.test(src)

  assertEquals(
    hasCounters && escalates,
    true,
    `${FOURSQUARE}: a run where every request failed no longer throws, so it ` +
      `returns HTTP 200 success, resets consecutive_failures, and auto-pause ` +
      `becomes unreachable again.`,
  )
})

Deno.test('source-awin remains the control: its breaker call is not swallowed', async () => {
  const src = await source(AWIN)
  // If someone "tidies" awin by adding a per-item catch, the one source that
  // currently auto-pauses correctly would stop doing so — and the comparison
  // that diagnosed this whole class would be gone with it.
  const start = src.indexOf('withCircuitBreaker')
  if (start === -1) throw new Error(`${AWIN}: breaker call disappeared`)
  const before = src.slice(Math.max(0, start - 400), start)
  assertEquals(
    /\btry\s*\{[^}]*$/.test(before),
    false,
    `${AWIN}: the breaker call is now inside a try block. awin is the control ` +
      `that proves swallowed errors defeat auto-pause; keep its throw reaching ` +
      `the handler so it still returns 500.`,
  )
})
