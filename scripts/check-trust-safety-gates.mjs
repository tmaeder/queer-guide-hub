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

if (failedCritical.length > 0) {
  console.error(`✗ ${failedCritical.length} CRITICAL gate(s) breached — blocking: ${failedCritical.map((g) => g.gate).join(', ')}`)
  process.exit(1)
}

console.log('✓ All CRITICAL trust-&-safety gates pass')
