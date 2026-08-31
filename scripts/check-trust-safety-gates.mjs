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

const res = await fetch(`${BASE}/rest/v1/rpc/trust_safety_gate_status`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
})

if (!res.ok) {
  console.error(`✗ trust_safety_gate_status RPC → HTTP ${res.status}`)
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

// ── search_facets / search_hybrid candidate-set parity ──────────────────────
// Separate RPC rather than another arm of trust_safety_gate_status(), because
// this one has to CALL both search RPCs rather than count rows in a table.
//
// It exists because the two functions build their candidate sets by hand, in two
// places, and nothing forces them to agree: search_facets carried no safety_gated
// filter from 20260623160001 until 20260829041548 and handed anonymous callers a
// per-category, per-tag breakdown of gated venues in criminalising countries while
// the results themselves were correctly withheld. Verified to FAIL against the
// pre-fix body (berghain 65 vs 26, naloxone 43 vs 4, gated:anon 1 vs 81), so it
// catches drift in both directions — under-counting AND over-counting.
const parityRes = await fetch(`${BASE}/rest/v1/rpc/search_facets_parity_failures`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})

let parityFailures = []
if (!parityRes.ok) {
  // An unreachable gate is not a passing gate.
  console.error(`✗ search_facets_parity_failures RPC → HTTP ${parityRes.status}: ${(await parityRes.text()).slice(0, 300)}`)
  process.exit(1)
}
parityFailures = await parityRes.json()

if (parityFailures.length > 0) {
  console.error('✗ [critical] search_facets_parity: search_facets and search_hybrid disagree about the candidate set')
  for (const f of parityFailures) {
    console.error(`    ${f.probe}: hybrid=${f.hybrid_total} facets=${f.facet_total} — ${f.detail}`)
  }
  console.error('  Both build `cand` by hand; diff the two WHERE clauses (see 20260829041548).')
} else {
  console.log('  ✓ [critical] search_facets_parity: candidate sets in step')
}

if (failedCritical.length > 0 || parityFailures.length > 0) {
  const names = [...failedCritical.map((g) => g.gate), ...(parityFailures.length ? ['search_facets_parity'] : [])]
  console.error(`✗ ${names.length} CRITICAL gate(s) breached — blocking: ${names.join(', ')}`)
  process.exit(1)
}

console.log('✓ All CRITICAL trust-&-safety gates pass')
