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
