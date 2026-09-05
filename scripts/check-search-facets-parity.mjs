#!/usr/bin/env node
/**
 * search_facets / search_hybrid candidate-set parity gate.
 * Schedule-only step of .github/workflows/trust-safety-gates.yml.
 *
 * Exits 1 if the two functions disagree about the candidate set, or if the RPC
 * cannot be reached — an unreachable gate is not a passing gate.
 *
 * ── WHAT IT GUARDS ────────────────────────────────────────────────────────────
 * A separate RPC rather than another arm of trust_safety_gate_status(), because
 * this one has to CALL both search RPCs rather than count rows in a table.
 *
 * It exists because the two functions build their candidate sets by hand, in two
 * places, and nothing forces them to agree: search_facets carried no safety_gated
 * filter from 20260623160001 until 20260829041548 and handed anonymous callers a
 * per-category, per-tag breakdown of gated venues in criminalising countries while
 * the results themselves were correctly withheld. Verified to FAIL against the
 * pre-fix body (berghain 65 vs 26, naloxone 43 vs 4, gated:anon 1 vs 81), so it
 * catches drift in both directions — under-counting AND over-counting.
 *
 * When touching either function, diff the two `cand` WHERE clauses (20260829041548).
 *
 * ── WHY IT IS NOT ON pull_request ─────────────────────────────────────────────
 * Two independent reasons, in the order they were established.
 *
 * 1. IT CANNOT REPORT ON THE PR IT BLOCKS. Like every gate in this workflow it
 *    reads LIVE PROD, and both functions only change when a migration applies —
 *    which happens on merge to main, after both the pull_request and merge_group
 *    runs. So a per-PR run can only ever surface a divergence that landed earlier,
 *    reddening whichever unrelated PR happens to run next. Exactly the reasoning
 *    that keeps check-legal-citation-links.mjs off pull_request, and the same
 *    failure documented for check-tag-hygiene's oscillating counters. The daily
 *    schedule catches the divergence at the same resolution, without the collateral.
 *
 * 2. IT HAS NO HEADROOM UNDER THE PostgREST TIMEOUT, and cannot be given any
 *    without rewriting the two live search functions. Measured on prod 2026-09-05:
 *
 *      warm, three consecutive calls   2378 / 2690 / 3532 ms
 *      first call into a cold corpus   7276 ms for the berghain probe ALONE
 *      explain(analyze) at idle        6963 ms, 0 rows
 *
 *    (20260829045226 measured 1.63-1.73 s when it shipped; the corpus has grown.)
 *    PostgREST connects as `authenticator`, whose rolconfig pins
 *    statement_timeout=8s — SET ROLE service_role does not lift it — so any
 *    concurrent load pushes a run over and the job dies with 57014. Both observed
 *    failures (2026-09-04 PR #3402, 2026-09-05 PR #3437) cleared on re-run, which
 *    is what disguised them as flake. Re-running a red required check to make it
 *    green is how a real failure gets waved through.
 *
 *    The cost is irreducible here. The gate makes 10 calls (3 generic probes x
 *    hybrid+facets, plus 4 gated calls) and EVERY one of them is a full pass over
 *    the corpus: `cand` plans as a Seq Scan on search_documents (118,834 rows,
 *    165 MB heap, 121 ms once cached) because the planner has no size estimate for
 *    the kwvec CTE it is semi-joined against, and the vector probes additionally
 *    traverse the 902 MB search_embeddings_hnsw index. Warm that is ~250 ms a call;
 *    cold it is disk-bound on a disk-constrained instance. No index fixes it — the
 *    query shape is the cost — and search_hybrid is the function this repo has
 *    already broken twice by rewriting (20260713100710, see 20260810170000).
 *
 * DO NOT "fix" a future timeout here by raising statement_timeout or adding a
 * retry. Both hide a 7-second query. If this needs to be per-PR again, make the
 * gate cheaper first and re-measure with explain(analyze) — not by observing that
 * CI went green once.
 *
 * ── UPDATE: THE BUDGET IS NOW PER PROBE (20270601114237) ──────────────────────
 * Reason 1 above is unchanged and is still why this is not on pull_request. What
 * changed is reason 2. The ten calls no longer share one statement_timeout: the
 * gate asks search_facets_parity_probes() for the probe list and calls
 * search_facets_parity_probe_failures() once per probe, so each is its own
 * top-level statement with its own 8 s. Neither forbidden shortcut was used — no
 * raised timeout, no retry, and NO PROBE WAS DROPPED. The work is identical; only
 * the number of statements it is spread across changed.
 *
 * Per-probe cost, explain(analyze) on prod 2026-09-05, warm:
 *
 *      gated (4 searches)  738 ms      hybrid:naloxone   441 ms
 *      hybrid:berghain     493 ms      keyword:bookshop  364 ms
 *
 * Evenly spread — there is no single hot probe to optimise instead — and the
 * heaviest is 36% of the total, so p95 moves from 92% of the budget to ~33%. It is
 * CACHE-bound, not plan-bound: the same naloxone probe measured 1902 ms cold and
 * 441 ms warm, which is why concurrent load is the trigger and why a single warm
 * timing proves nothing about the tail.
 *
 * Each probe's duration is printed, so the next drift toward the wall is visible
 * before it becomes a red run. If it needs to go back on pull_request, reason 1 —
 * that this reads live prod and so can never report on the PR it blocks — has to
 * be answered first, and per-probe timing does not answer it.
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping search-facets parity gate')
  process.exit(0)
}

const started = Date.now()

// An unreachable gate is not a passing gate: every non-200 exits 1 and the body
// is echoed, so the reason is on the record rather than inferred.
async function rpc(fn, body) {
  const at = Date.now()
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300)
    console.error(`✗ ${fn} RPC → HTTP ${r.status} after ${Date.now() - at} ms: ${text}`)
    if (text.includes('57014')) {
      console.error('  57014 is the 8s statement_timeout on `authenticator`, not a divergence.')
      console.error('  Read the header of this file before reaching for a retry or a longer timeout.')
    }
    process.exit(1)
  }
  return r.json()
}

const probes = await rpc('search_facets_parity_probes', {})

// A gate with no probes proves nothing. Without this the loop below iterates zero
// times and the gate reports "in step" having checked absolutely nothing — the
// same shape as the leak it exists to catch, one level up.
if (!Array.isArray(probes) || probes.length === 0) {
  console.error('✗ [critical] search_facets_parity: search_facets_parity_probes() returned no probes — the gate would have checked nothing')
  process.exit(1)
}

// ONE PROBE PER REQUEST (20270601114237). The ten search calls used to run inside
// ONE statement sharing one 8s budget; per-probe they get one each, and the
// heaviest carries 36% of the work. Sequential on purpose — firing them in
// parallel would recreate the concurrent load that causes the timeouts.
const failures = []
for (const { probe } of probes) {
  const at = Date.now()
  failures.push(...(await rpc('search_facets_parity_probe_failures', { p_probe: probe })))
  console.log(`    · ${probe} — ${Date.now() - at} ms`)
}

if (failures.length === 0) {
  console.log(`✓ [critical] search_facets_parity: candidate sets in step (${Date.now() - started} ms)`)
  process.exit(0)
}

console.error('✗ [critical] search_facets_parity: search_facets and search_hybrid disagree about the candidate set')
for (const f of failures) {
  console.error(`    ${f.probe}: hybrid=${f.hybrid_total} facets=${f.facet_total} — ${f.detail}`)
}
console.error('  Both build `cand` by hand; diff the two WHERE clauses (see 20260829041548).')
process.exit(1)
