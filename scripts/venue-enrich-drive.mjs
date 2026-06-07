#!/usr/bin/env node
// Driver for the venue-agentic-enrich edge function. Fills missing venue content (description,
// category, tags, hours, contact, images) from FREE sources, cheapest-first. The function does
// the fetch + extract + LLM + DB write; this script picks the work, shards it, and paces it.
//
// Work selection: venues_due_for_refresh(N) returns prioritised venues + routing flags. We pull
// a round of needy ids, split into 4 disjoint shards, and call the function with explicit
// venue_ids per shard — so the 4 concurrent invocations never process the same venue (no double
// LLM cost). 4 shards = the safe LLM ceiling (8 once tripped the shared CF Workers AI breaker).
//
// Resumable: the function stamps last_refreshed_at on every venue it touches, which drops it down
// the venues_due_for_refresh priority order, so each round naturally advances. A restart resumes.
// Circuit-aware: on circuit_open the round backs off 60s. Disk-guarded: prod DB is disk-constrained
// (description writes re-embed search_documents); hard-stops (exit 42) before the read-only cliff.
//
// Run (detached, supervised): see scripts/run-supervised.sh
//   GEOCODE_TOKEN=sbp_... SERVICE_ROLE_KEY=ey... node scripts/venue-enrich-drive.mjs
// Mgmt token: RAW=$(security find-generic-password -s "Supabase CLI" -w); echo "${RAW#go-keyring-base64:}" | base64 -d
//
// Exit codes: 0 = no venues left to enrich (done) · 42 = stopped at disk guard (do NOT auto-restart)
//             1 = fatal error (supervisor restarts; selection makes it resume)

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const FN = `https://${PROJECT}.supabase.co/functions/v1/venue-agentic-enrich`;
const TOKEN = process.env.GEOCODE_TOKEN;                 // Supabase Management API (keychain)
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.EVENT_QUALITY_WEBHOOK_SECRET;
const UA_MGMT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) QueerGuide/1.0';
const PER_SHARD = Number(process.env.BATCH || 5);        // venues per shard per round
const SHARDS = 4;
const DAILY_CAP = Number(process.env.DAILY_CAP || 1_000_000); // driver, not the fn, bounds the run
const DISK_STOP_BYTES = Number(process.env.DISK_STOP_MB || 6300) * 1024 * 1024;
const DISK_CHECK_EVERY = 5; // rounds
const DRY_RUN = process.env.DRY_RUN === '1';

if (!TOKEN) { console.error('GEOCODE_TOKEN not set'); process.exit(1); }
if (!SERVICE_KEY && !WEBHOOK_SECRET) { console.error('SERVICE_ROLE_KEY or EVENT_QUALITY_WEBHOOK_SECRET required'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function fetchT(url, opts = {}, timeoutMs = 30000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function mgmt(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(MGMT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA_MGMT },
        body: JSON.stringify({ query: sql }),
      }, 30000);
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

async function callFn(venueIds) {
  const headers = { 'Content-Type': 'application/json' };
  if (WEBHOOK_SECRET) headers['X-Webhook-Secret'] = WEBHOOK_SECRET;
  if (SERVICE_KEY) { headers.Authorization = `Bearer ${SERVICE_KEY}`; headers.apikey = SERVICE_KEY; }
  const res = await fetchT(FN, {
    method: 'POST', headers,
    body: JSON.stringify({ venue_ids: venueIds, batch_limit: venueIds.length, daily_cap: DAILY_CAP, dry_run: DRY_RUN }),
  }, 180000);
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

async function dueIds(limit) {
  const rows = await mgmt(
    `SELECT id FROM public.venues_due_for_refresh(${limit})
     WHERE needs_description OR needs_category OR needs_tags OR needs_hours OR needs_contact OR needs_images`,
  );
  return rows.map((r) => r.id);
}

async function main() {
  const want = PER_SHARD * SHARDS;
  const totals = { enriched: 0, flagged: 0, skipped: 0, rounds: 0 };
  let backoff = 5000;

  for (;;) {
    const ids = await dueIds(want * 2); // over-fetch; routing filter may thin the set
    if (!ids.length) { console.log(`[${ts()}] no venues left to enrich — DONE`); break; }
    const round = ids.slice(0, want);

    const shards = Array.from({ length: SHARDS }, (_, s) => round.filter((_, i) => i % SHARDS === s)).filter((a) => a.length);
    let circuit = false;
    const settled = await Promise.allSettled(shards.map((sh) => callFn(sh)));
    for (const r of settled) {
      if (r.status === 'rejected') { console.error(`[${ts()}] shard error: ${r.reason?.message ?? r.reason}`); continue; }
      const v = r.value;
      if (v.circuit_open) circuit = true;
      totals.enriched += v.enriched || 0; totals.flagged += v.flagged || 0; totals.skipped += v.skipped || 0;
    }
    totals.rounds++;

    if (circuit) { console.warn(`[${ts()}] circuit_open — backing off 60s`); await sleep(60000); continue; }
    if (settled.every((r) => r.status === 'rejected')) { await sleep(backoff); backoff = Math.min(backoff * 2, 120000); continue; }
    backoff = 5000;

    if (totals.rounds % DISK_CHECK_EVERY === 0) {
      const [{ size }] = await mgmt('SELECT pg_database_size(current_database()) AS size');
      const mb = Math.round(size / 1024 / 1024);
      console.log(`[${ts()}] rounds=${totals.rounds} enriched=${totals.enriched} flagged=${totals.flagged} skipped=${totals.skipped} db=${mb}MB`);
      if (Number(size) >= DISK_STOP_BYTES) { console.error(`[${ts()}] DISK GUARD: ${mb}MB >= stop — halting (exit 42)`); process.exit(42); }
    }
    await sleep(500);
  }

  console.log(`[${ts()}] ALL DONE: rounds=${totals.rounds} enriched=${totals.enriched} flagged=${totals.flagged} skipped=${totals.skipped}`);
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
