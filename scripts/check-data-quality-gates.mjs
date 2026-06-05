#!/usr/bin/env node
/**
 * Data-quality release gates (audit 2026-06-05 §4).
 * Called by .github/workflows/data-quality-gates.yml on PRs + nightly.
 *
 * Runs the release_gate_checks() RPC and fails (exit 1) if any CRITICAL gate
 * reports failures. HIGH gates are surfaced as warnings but do not block.
 *
 *   critical: hotline_unverified, person_outing_guard, crim_consistency, dup_integrity
 *   high:     hotline_reachable, hotline_url_live
 */

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping data-quality gates')
  process.exit(0)
}

const res = await fetch(`${BASE}/rest/v1/rpc/release_gate_checks`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!res.ok) {
  console.error(`release_gate_checks → HTTP ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const rows = await res.json()
let blocking = 0

for (const r of rows.sort((a, b) => a.severity.localeCompare(b.severity) || a.gate.localeCompare(b.gate))) {
  const n = Number(r.failures)
  const detail = r.detail && Object.keys(r.detail).length ? ` ${JSON.stringify(r.detail)}` : ''
  if (n === 0) {
    console.log(`✓ [${r.severity}] ${r.gate}: 0`)
  } else if (r.severity === 'critical') {
    blocking += n
    console.error(`✗ [critical] ${r.gate}: ${n}${detail}`)
  } else {
    console.warn(`⚠ [${r.severity}] ${r.gate}: ${n}${detail}`)
  }
}

if (blocking > 0) {
  console.error(`\n✗ ${blocking} critical data-quality failure(s) — blocking.`)
  process.exit(1)
}
console.log('\n✓ All critical data-quality gates passed.')
