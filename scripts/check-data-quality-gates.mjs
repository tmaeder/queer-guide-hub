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

import { readFile } from 'node:fs/promises';

const criticalCeilings = JSON.parse(
  await readFile(new URL('./data-quality-gate-baseline.json', import.meta.url), 'utf8'),
);

import { callRpc, notEvaluated, readGateSnapshot, stallReason } from './lib/gate-rpc.mjs';

const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping data-quality gates');
  process.exit(0);
}

const callGates = () =>
  callRpc(`${BASE}/rest/v1/rpc/release_gate_checks`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });

// A gate script has THREE outcomes and only two are about the gate: it passed,
// it was breached, or IT WAS NEVER EVALUATED — the safety checks silently did
// not run and the PR goes red for a reason unrelated to its diff. Retry once:
// at 17:11 UTC on 2026-09-04 one run passed and another failed in the SAME
// MINUTE, which is a query sitting on its ceiling, and one retry is the
// difference between a flake and a blocked release.
//
// TWO CONDITIONS COUNT AS NOT EVALUATED, and only one was handled here until
// 2026-10-14. A Postgres 57014 is the 8s statement_timeout: the server gave up
// mid-query. The other is a TRANSPORT STALL, where `fetch` throws instead of
// returning a response — so a branch reading `57014` out of a response body is
// structurally unreachable and this script dies on an unhandled rejection with
// a raw stack trace. That is what happened on #4404's head 09fdf873f, here at
// line 34 (18:26:22 -> 18:31:25) and in check-trust-safety-gates.mjs at line 32
// (18:26:19 -> 18:31:21): two jobs, two runners, both the FIRST call, both dead
// at exactly five minutes (undici's headers timeout), four seconds apart, on a
// documentation-only diff. `notEvaluated()` (scripts/lib/gate-rpc.mjs) owns
// which conditions count, so the sibling scripts cannot drift apart on it.
//
// THE RETRY IS NOW DELAYED, AND THAT DELAY IS THE WHOLE FIX. This script
// retried immediately, which is the defect #3996 measured on the sibling: both
// attempts land in the SAME contention window and both fail seconds apart. The
// 2026-10-14 stall lasted about nine minutes, so an instant retry re-samples
// nothing.
//
// Deliberately LOUD. A retry that quietly succeeds is how a function creeps back
// toward the ceiling unnoticed — which is exactly what happened between
// 20261021110000 and 20270401100400. If this appears in the logs, re-measure the
// RPC per arm; do not raise the retry count.
//
// A non-evaluation never becomes a pass: it still exits 1 below. Any other
// non-ok status is the server answering and still fails at once — a real gate
// breach must never be retried into silence.
//
// ALL THREE gate RPCs go through this helper. Until 2026-11-08 only
// release_gate_checks did, so one 57014 on event_quality_gate_checks or
// personality_quality_gate_checks failed the PR outright (#5209: the release
// call timed out, retried and passed, then the event call timed out in the
// same load window with no retry).
const RETRY_DELAY_MS = 30_000;
async function callWithRetry(rpc, callOnce) {
  // Precomputed every 10 min by pg_cron; null (missing/stale) falls back to live.
  const snap = await readGateSnapshot(BASE, KEY, rpc);
  if (snap) return snap;
  let res = await callOnce();
  if (notEvaluated(res)) {
    console.warn(
      `⚠ ${rpc} did not evaluate any gate — ${stallReason(res)}. ` +
        `Retrying ONCE in ${RETRY_DELAY_MS / 1000}s, to sample a different load window.`,
    );
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const t0 = Date.now();
    res = await callOnce();
    console.warn(
      `⚠ ${rpc} retry ${res.ok ? 'SUCCEEDED' : 'FAILED'} after ${Date.now() - t0}ms. If it FAILED on the ` +
        'statement timeout, the RPC is near its 8s ceiling — re-measure per arm (see migration ' +
        '20270401100400) rather than retrying harder. If it FAILED with no HTTP response, that is ' +
        'the network or the instance, not this query, and no amount of re-measuring the arms helps.',
    );
  }
  return res;
}

const res = await callWithRetry('release_gate_checks', callGates);

if (!res.ok) {
  console.error(`release_gate_checks → HTTP ${res.status}: ${res.body}`);
  process.exit(1);
}

const rows = res.data;
let blocking = 0;

const reportGate = (r) => {
  const n = Number(r.failures);
  const detail = r.detail && Object.keys(r.detail).length ? ` ${JSON.stringify(r.detail)}` : '';
  if (n === 0) {
    console.log(`✓ [${r.severity}] ${r.gate}: 0`);
    return;
  }
  if (r.severity !== 'critical') {
    console.warn(`⚠ [${r.severity}] ${r.gate}: ${n}${detail}`);
    return;
  }

  const ceiling = Number(criticalCeilings[r.gate] ?? 0);
  if (n > ceiling) {
    blocking += n - ceiling;
    console.error(`✗ [critical] ${r.gate}: ${n} > ceiling ${ceiling}${detail}`);
  } else if (n < ceiling) {
    console.warn(
      `⚠ [critical ratchet] ${r.gate}: ${n} < ceiling ${ceiling}; lower the committed ceiling to ${n}${detail}`,
    );
  } else {
    console.warn(`⚠ [critical backlog] ${r.gate}: ${n} at shrinking ceiling ${ceiling}${detail}`);
  }
};

for (const r of rows.sort(
  (a, b) => a.severity.localeCompare(b.severity) || a.gate.localeCompare(b.gate),
)) {
  reportGate(r);
}

// Personality v2 gates live separately so the existing release_gate_checks()
// contract can remain stable for older deployments. PGRST202 means the branch
// is being checked before its migration has reached the target database; warn
// during that rollout window, but every other RPC failure remains fatal.
const personalityRes = await callWithRetry('personality_quality_gate_checks', () =>
  callRpc(`${BASE}/rest/v1/rpc/personality_quality_gate_checks`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  }),
);
if (!personalityRes.ok) {
  const body = personalityRes.body;
  if (personalityRes.status === 404 && body.includes('PGRST202')) {
    console.warn('⚠ personality_quality_gate_checks is not deployed yet — rollout window');
  } else {
    console.error(`personality_quality_gate_checks → HTTP ${personalityRes.status}: ${body}`);
    process.exit(1);
  }
} else {
  const personalityRows = personalityRes.data;
  for (const r of personalityRows.sort(
    (a, b) => a.severity.localeCompare(b.severity) || a.gate.localeCompare(b.gate),
  )) {
    reportGate(r);
  }
}

// Event programme gates remain advisory while event_quality_rollout is in
// shadow mode. The RPC promotes zero-tolerance gates to critical only after
// enforcement is explicitly enabled.
const eventRes = await callWithRetry('event_quality_gate_checks', () =>
  callRpc(`${BASE}/rest/v1/rpc/event_quality_gate_checks`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  }),
);
if (!eventRes.ok) {
  const body = eventRes.body;
  if (eventRes.status === 404 && body.includes('PGRST202')) {
    console.warn('⚠ event_quality_gate_checks is not deployed yet — rollout window');
  } else {
    console.error(`event_quality_gate_checks → HTTP ${eventRes.status}: ${body}`);
    process.exit(1);
  }
} else {
  const eventRows = eventRes.data;
  for (const r of eventRows.sort(
    (a, b) => a.severity.localeCompare(b.severity) || a.gate.localeCompare(b.gate),
  )) {
    reportGate(r);
  }
}

if (blocking > 0) {
  console.error(`\n✗ ${blocking} critical data-quality failure(s) — blocking.`);
  process.exit(1);
}
console.log('\n✓ All critical data-quality gates passed.');
