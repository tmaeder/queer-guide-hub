/**
 * One classification of "the gate did not run", shared by the gate scripts that
 * retry on it.
 *
 * A gate script has THREE outcomes and only two of them are about the gate: it
 * passed, it was breached, or IT WAS NEVER EVALUATED. The third must read as
 * neither of the others — that is the whole reasoning already written out in
 * check-trust-safety-gates.mjs, and this module exists so the four scripts
 * cannot drift apart on what counts as the third (the scripts/lib/
 * remote-migrations.mjs precedent: one fetch so two callers cannot disagree
 * about what "applied" means).
 *
 * WHY A SECOND NON-EVALUATION EXISTS, measured 2026-10-14. Those scripts gated
 * their retry on a Postgres 57014 in the RESPONSE BODY, which can only be read
 * once a response exists. `fetch` does not always produce one: on a transport
 * stall it THROWS, so the 57014 branch is structurally unreachable and the
 * script dies on an unhandled rejection with a raw stack trace. Observed on
 * #4404's head 09fdf873f — `Trust & safety gates` at check-trust-safety-gates
 * .mjs:32 (18:26:19 -> 18:31:21) and `Critical data-quality gates` at
 * check-data-quality-gates.mjs:34 (18:26:22 -> 18:31:25): two different
 * scripts, two different jobs, two different runners, both the FIRST RPC call,
 * both dead at exactly five minutes (undici's default headers timeout) and
 * ending four seconds apart. In the same job `check-definer-view-grants.mjs`
 * then took 3m41s for three checks that normally take about a second, and
 * everything after 18:35:07 ran at normal speed. That is one prod stall
 * spanning ~18:26-18:35, not two script bugs, and the PR's diff was one
 * documentation file.
 *
 * SO A THROW AND A 57014 ARE THE SAME CONDITION HERE, and the difference is
 * only WHERE the clock ran out: undici gave up client-side at 300s, or Postgres
 * gave up server-side at the 8s `authenticator` ceiling. Neither evaluated a
 * gate. Both get the one delayed retry; neither may be mistaken for a breach.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it never converts a non-evaluation into a
 * pass. A gate that could not run must still fail its check — these are
 * trust-&-safety and data-quality gates, and "we could not look" reading as
 * "nothing found" is the vacuous-green failure this repo keeps recording. The
 * improvement is that the run now says which of the three happened instead of
 * printing a stack trace.
 */

/**
 * `status` for a call that produced no HTTP response at all. Zero is chosen
 * because no real HTTP status is 0, so `status === 0` cannot collide with a
 * server answer, and the scripts' existing `HTTP ${status}` logging still
 * prints something truthful.
 */
export const NO_RESPONSE = 0

/** Pull a usable short cause out of whatever `fetch` threw. */
function causeOf(err) {
  return (
    err?.cause?.code ??
    err?.code ??
    err?.cause?.name ??
    err?.name ??
    'unknown'
  )
}

/**
 * Call a PostgREST RPC and NEVER throw.
 *
 * Returns `{ ok, status, body, data }`:
 *   - ok    — the response was 2xx AND its JSON parsed
 *   - status— the HTTP status, or NO_RESPONSE when there was no response
 *   - body  — the error text (null when ok), always a string when not ok, so a
 *             caller's `body?.includes(...)` keeps working unchanged
 *   - data  — the parsed JSON when ok, else null
 *
 * The three failure shapes are reported apart in `body` because they need
 * different fixes: no response at all (transport), a non-2xx (the server
 * answered, and 57014 lives here), and a 2xx whose body would not parse.
 */
export async function callRpc(url, init) {
  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    return {
      ok: false,
      status: NO_RESPONSE,
      body: `fetch failed before any HTTP response (${causeOf(err)}: ${err?.message ?? err})`,
      data: null,
    }
  }

  if (!res.ok) {
    let body
    try {
      body = await res.text()
    } catch (err) {
      // The status is real and is the thing worth reporting; losing the body is
      // not worth losing the status over.
      body = `<response body unreadable: ${causeOf(err)}>`
    }
    return { ok: false, status: res.status, body, data: null }
  }

  try {
    return { ok: true, status: res.status, body: null, data: await res.json() }
  } catch (err) {
    // A 2xx the caller cannot parse evaluated no gate either, but it is NOT a
    // transport stall and must not claim to be one.
    return {
      ok: false,
      status: res.status,
      body: `response was HTTP ${res.status} but its body did not parse as JSON (${causeOf(err)})`,
      data: null,
    }
  }
}

/**
 * Cloudflare's origin-side 5xx range: 520 unknown error, 521 origin down, 522
 * connection timed out, 523 origin unreachable, 524 a timeout occurred, 525/526
 * TLS, 527 railgun. Every one means the CDN could not get a usable response out
 * of the origin. Supabase sits behind Cloudflare and PostgREST never emits any
 * of them, so the range is unambiguous — it is always the CDN talking ABOUT the
 * origin, never the origin answering about a gate.
 */
export const CF_ORIGIN_ERROR_MIN = 520
export const CF_ORIGIN_ERROR_MAX = 527

function isCloudflareOriginError(status) {
  return (
    typeof status === 'number' &&
    status >= CF_ORIGIN_ERROR_MIN &&
    status <= CF_ORIGIN_ERROR_MAX
  )
}

/**
 * Did this call fail to EVALUATE the gate, as opposed to finding it breached?
 *
 * Only these four, and the narrowness is the point: anything else — a 403, a
 * 404, a 500 naming a real error — is the server answering, and retrying it
 * would retry a genuine breach into silence.
 *
 * THE FOURTH WAS MEASURED 2026-10-17. `release_gate_checks` came back
 *   HTTP 522: <!DOCTYPE html>…  (Cloudflare "connection timed out")
 * at 06:28, during a window in which the Postgres instance was saturated — 35
 * active client backends, and a trivial `pg_stat_activity` read could not even
 * get a connection. A 522 matched NONE of the other arms: its status is a real
 * number so it is not NO_RESPONSE, and its body is Cloudflare's HTML
 * interstitial so it carries neither PGRST002 nor 57014. It fell through to
 * "the server answered" and hard-failed with no retry, reddening `Critical
 * data-quality gates` on a PR whose diff could not affect it. Not novel either:
 * CLAUDE.md records a Supabase 522 turning all 21 open PRs red at once on
 * 2026-09-05.
 *
 * IT IS THE PUREST "COULD NOT LOOK" OF THE FOUR. With a 57014 the query at
 * least reached Postgres; with PGRST002 the request at least reached PostgREST;
 * with a throw it at least left this process. Here the CDN is reporting that it
 * never got an answer to relay.
 *
 * MATCHED ON THE STATUS RANGE AND NOT ON A BLANKET 5xx, and that bound is
 * load-bearing: a Postgres 57014 arrives as **HTTP 500** with the code in the
 * body, and a 500 naming a real error is the server answering. Widening to 5xx
 * would retry genuine breaches into silence, which is the one thing this module
 * must never do. 520-527 is safe precisely because PostgREST cannot produce it.
 *
 * THE THIRD WAS MEASURED 2026-10-17. PostgREST answers
 *   503 {"code":"PGRST002","message":"Could not query the database for the
 *        schema cache. Retrying."}
 * when it cannot reach Postgres at all — it could not even load the schema to
 * route the call, so it evaluated nothing. Observed failing `No API-role
 * writes on SECURITY DEFINER views` on #4470 during one of that day's
 * saturation stalls, i.e. reporting a security gate it never ran as a security
 * FAILURE. That is the same category error as the 57014 and the transport
 * throw, one layer further out.
 *
 * Matched on the PGRST002 CODE, not on a bare 503: a 503 carrying some other
 * body is not necessarily PostgREST declining to serve, and widening this is
 * exactly how a real breach gets retried into silence.
 */
export function notEvaluated(result) {
  if (!result || result.ok) return false
  if (result.status === NO_RESPONSE) return true
  if (isCloudflareOriginError(result.status)) return true
  if (result.body?.includes('PGRST002')) return true
  return Boolean(result.body?.includes('57014'))
}

/** Human-readable reason, for a log line that has to name which happened. */
export function stallReason(result) {
  if (!notEvaluated(result)) return null
  if (result.status === NO_RESPONSE) return 'no HTTP response (transport stall)'
  if (isCloudflareOriginError(result.status)) {
    return `Cloudflare could not reach the origin (HTTP ${result.status})`
  }
  if (result.body?.includes('PGRST002')) return 'PostgREST could not reach Postgres (PGRST002)'
  return 'Postgres statement_timeout (57014)'
}
