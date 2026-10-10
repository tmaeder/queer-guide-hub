#!/usr/bin/env node
/**
 * Trust-&-safety release gates.
 * Called by .github/workflows/trust-safety-gates.yml
 *
 * Calls the trust_safety_gate_status() RPC and:
 *   - exits 1 if any CRITICAL gate has failing > 0 (blocks release)
 *   - warns (exit 0) on HIGH gate failures
 *
 * Harm-anchored gates from docs/audits/2026-06-05-trust-safety-audit.md §4.
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping trust-&-safety gates')
  process.exit(0)
}

const callGates = () =>
  fetch(`${BASE}/rest/v1/rpc/trust_safety_gate_status`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

let res = await callGates()
let body = res.ok ? null : await res.text()

// 57014 is Postgres's statement_timeout on `authenticator`, NOT a gate being
// breached. The RPC ran out of time, so NO gate was evaluated at all and the PR
// goes red for a reason unrelated to its diff — on a REQUIRED check. Same
// handling as check-tag-hygiene.mjs, check-data-quality-gates.mjs and
// check-search-facets-parity.mjs; this script was the one that never got it.
//
// Measured 2026-10-10 on the live instance, after this fired on #4275 (green on
// the previous head 20 minutes earlier, with the identical diff): the function
// is **294 ms / 55,096 blocks / zero temp spill** cold-planned, and 800 ms warm,
// against the 8,000 ms ceiling — 27x headroom. An 8-second timeout on that is
// contention, not cost, which is why this retries rather than shaving arms: a
// 20% optimisation does not survive a 6x spike. The claim in the trailing
// comment below — that what is left "answers in well under a second" — was
// re-measured and still holds, so nothing here needs optimising.
//
// Deliberately LOUD, and the retry count stays at ONE. A retry that quietly
// succeeds is how a function creeps back toward the ceiling unnoticed.
//
// THE RETRY IS DELAYED, AND THAT DELAY IS THE WHOLE FIX. It is the lesson #3996
// paid for on the sibling script: an immediate retry puts both attempts inside
// the SAME contention window and both time out seconds apart. Contention here
// lasts minutes, not milliseconds, so an instant retry re-samples nothing.
//
// Gated on 57014 ONLY. Any other non-ok status still fails immediately and at
// once — a real gate breach must never be retried into silence.
const RETRY_DELAY_MS = 30_000
if (!res.ok && body?.includes('57014')) {
  console.warn(
    `⚠ trust_safety_gate_status() hit the statement timeout (57014) — NO gate was evaluated. ` +
      `Retrying ONCE in ${RETRY_DELAY_MS / 1000}s, to sample a different load window.`,
  )
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
  const t0 = Date.now()
  res = await callGates()
  body = res.ok ? null : await res.text()
  console.warn(
    `⚠ retry ${res.ok ? 'SUCCEEDED' : 'FAILED'} after ${Date.now() - t0}ms. If it FAILED, the ` +
      'database was busy for >30s or the function has genuinely regressed — measure it on a quiet ' +
      'instance before concluding which.',
  )
}

if (!res.ok) {
  // The body is printed because without it this line read `HTTP 500` and named
  // no cause, so diagnosing the #4275 occurrence needed a query against prod
  // rather than the CI log. A failed probe has to say WHY it failed.
  console.error(`✗ trust_safety_gate_status RPC → HTTP ${res.status}: ${body}`)
  process.exit(1)
}

const gates = await res.json()
const critical = gates.filter((g) => g.severity === 'critical')
const high = gates.filter((g) => g.severity === 'high')

console.log('Trust-&-safety gates:')
for (const g of [...critical, ...high]) {
  const mark = g.failing > 0 ? (g.severity === 'critical' ? '✗' : '⚠') : '✓'
  console.log(`  ${mark} [${g.severity}] ${g.gate} = ${g.failing}  (${g.detail})`)
}

const failedCritical = critical.filter((g) => g.failing > 0)
const failedHigh = high.filter((g) => g.failing > 0)

if (failedHigh.length > 0) {
  console.warn(`⚠ ${failedHigh.length} HIGH gate(s) over threshold: ${failedHigh.map((g) => g.gate).join(', ')}`)
}

// The search_facets / search_hybrid candidate-set parity gate used to run here.
// It now lives in scripts/check-search-facets-parity.mjs as a schedule-only step,
// because it reads live prod (so it can only report a divergence that landed
// BEFORE the PR it blocks) and because its 10 full-corpus scans have no headroom
// under the 8s statement_timeout PostgREST inherits from `authenticator`. Both
// reasons, and the measurements behind them, are in that file's header.
//
// Everything left in this script is a table count that answers in well under a
// second, which is what keeps this a required check.

if (failedCritical.length > 0) {
  const names = failedCritical.map((g) => g.gate)
  console.error(`✗ ${names.length} CRITICAL gate(s) breached — blocking: ${names.join(', ')}`)
  process.exit(1)
}

console.log('✓ All CRITICAL trust-&-safety gates pass')
