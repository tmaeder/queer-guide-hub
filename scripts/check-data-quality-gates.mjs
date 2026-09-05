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

const callGates = () =>
  fetch(`${BASE}/rest/v1/rpc/release_gate_checks`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  })

let res = await callGates()
let body = res.ok ? null : await res.text()

// 57014 is Postgres's statement_timeout, NOT a gate failing. The RPC ran out of
// time, so no gate was evaluated at all — the safety checks silently did not run
// and the PR goes red for a reason unrelated to its diff. Retry once: at 17:11
// UTC on 2026-09-04 one run passed and another failed in the SAME MINUTE, which
// is a query sitting on its ceiling, and one retry is the difference between a
// flake and a blocked release.
//
// Deliberately LOUD. A retry that quietly succeeds is how a function creeps back
// toward the ceiling unnoticed — which is exactly what happened between
// 20261021110000 and 20270309163055. If this appears in the logs, re-measure the
// RPC per arm; do not raise the retry count.
if (!res.ok && body?.includes('57014')) {
  console.warn('⚠ release_gate_checks hit the statement timeout (57014) — no gate was evaluated. Retrying once.')
  const t0 = Date.now()
  res = await callGates()
  body = res.ok ? null : await res.text()
  console.warn(
    `⚠ retry ${res.ok ? 'SUCCEEDED' : 'FAILED'} after ${Date.now() - t0}ms. The RPC is near its 8s ` +
      'ceiling — re-measure per arm (see migration 20270309163055) rather than retrying harder.',
  )
}

if (!res.ok) {
  console.error(`release_gate_checks → HTTP ${res.status}: ${body}`)
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
