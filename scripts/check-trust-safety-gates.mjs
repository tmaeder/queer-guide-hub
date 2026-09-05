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

import { classifyRpcFailure, retryDelayMs } from './lib/rpc-retry.mjs';

const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
  console.warn(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping trust-&-safety gates',
  );
  process.exit(0);
}

const res = await fetch(`${BASE}/rest/v1/rpc/trust_safety_gate_status`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

if (!res.ok) {
  console.error(`✗ trust_safety_gate_status RPC → HTTP ${res.status}`);
  process.exit(1);
}

const gates = await res.json();
const critical = gates.filter((g) => g.severity === 'critical');
const high = gates.filter((g) => g.severity === 'high');

console.log('Trust-&-safety gates:');
for (const g of [...critical, ...high]) {
  const mark = g.failing > 0 ? (g.severity === 'critical' ? '✗' : '⚠') : '✓';
  console.log(`  ${mark} [${g.severity}] ${g.gate} = ${g.failing}  (${g.detail})`);
}

const failedCritical = critical.filter((g) => g.failing > 0);
const failedHigh = high.filter((g) => g.failing > 0);

if (failedHigh.length > 0) {
  console.warn(
    `⚠ ${failedHigh.length} HIGH gate(s) over threshold: ${failedHigh.map((g) => g.gate).join(', ')}`,
  );
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
// The call is retried on a TRANSIENT failure only — in practice the 8 s
// `authenticator` statement_timeout (57014). This gate calls search_hybrid and
// search_facets ten times in one statement; the migration that shipped it
// measured 1.63-1.73 s, but on a busy instance the same commit failed twice and
// then passed a plain re-run in 8 s while every other open PR passed minutes
// later. Left alone it reddens unrelated PRs at random.
//
// Raising the ceiling is NOT available: a function cannot raise its own
// statement_timeout (the timer is armed at top-level statement start, so a SET
// inside it never re-arms — measured on this cluster), and the only other lever
// is the `authenticator` role, which governs every user-facing query.
//
// Each attempt is TIMED and reported. That is the point: search_hybrid is the
// live search path, so if this is a real regression rather than contention, the
// durations say so in the build log instead of vanishing into a silent retry.
const PARITY_ATTEMPTS = 3;
let parityFailures = [];
const parityTimings = [];

for (let attempt = 1; ; attempt++) {
  const started = Date.now();
  const res = await fetch(`${BASE}/rest/v1/rpc/search_facets_parity_failures`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const elapsedMs = Date.now() - started;
  parityTimings.push(`${(elapsedMs / 1000).toFixed(1)}s${res.ok ? '' : ` HTTP ${res.status}`}`);

  if (res.ok) {
    parityFailures = await res.json();
    break;
  }

  const bodyText = (await res.text()).slice(0, 300);
  const kind = classifyRpcFailure(res.status, bodyText);

  // An unreachable gate is not a passing gate — every exit below is a failure.
  if (kind === 'fatal') {
    console.error(`✗ search_facets_parity_failures RPC → HTTP ${res.status}: ${bodyText}`);
    process.exit(1);
  }
  if (attempt >= PARITY_ATTEMPTS) {
    console.error(
      `✗ search_facets_parity_failures RPC → HTTP ${res.status} after ${PARITY_ATTEMPTS} attempts (${parityTimings.join(', ')}): ${bodyText}`,
    );
    console.error(
      '  Persistent, not contention. The gate calls search_hybrid/search_facets ten times in one statement; if this keeps happening, that work no longer fits under the 8s ceiling and needs splitting or optimising — do not just add attempts.',
    );
    process.exit(1);
  }
  console.warn(
    `⚠ search_facets_parity_failures attempt ${attempt}/${PARITY_ATTEMPTS} failed (HTTP ${res.status}, ${(elapsedMs / 1000).toFixed(1)}s) — retrying`,
  );
  await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
}

// Always reported, pass or fail, so a creeping slowdown is visible before it
// becomes a timeout rather than after.
console.log(`  search_facets_parity RPC: ${parityTimings.join(', ')}`);

if (parityFailures.length > 0) {
  console.error(
    '✗ [critical] search_facets_parity: search_facets and search_hybrid disagree about the candidate set',
  );
  for (const f of parityFailures) {
    console.error(`    ${f.probe}: hybrid=${f.hybrid_total} facets=${f.facet_total} — ${f.detail}`);
  }
  console.error('  Both build `cand` by hand; diff the two WHERE clauses (see 20260829041548).');
} else {
  console.log('  ✓ [critical] search_facets_parity: candidate sets in step');
}

if (failedCritical.length > 0 || parityFailures.length > 0) {
  const names = [
    ...failedCritical.map((g) => g.gate),
    ...(parityFailures.length ? ['search_facets_parity'] : []),
  ];
  console.error(`✗ ${names.length} CRITICAL gate(s) breached — blocking: ${names.join(', ')}`);
  process.exit(1);
}

console.log('✓ All CRITICAL trust-&-safety gates pass');
