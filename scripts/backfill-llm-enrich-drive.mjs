#!/usr/bin/env node
// Driver for the backfill-llm-enrich edge function. Runs LLM geo+relevance over committed
// news_articles, then relevance over events, by repeatedly invoking the function until every
// shard is exhausted. The function (not this script) does the LLM + DB writes — this just
// paces and parallelises it.
//
// Parallelism without overlap: UUIDs sort lexically, so 4 disjoint id-ranges (shards) run
// concurrently and never fetch the same row. Each shard loops one in-flight call at a time.
// Resumable: the function drives off classified_at IS NULL, so a restart just continues.
// Circuit-aware: on circuit_open (LLM breaker tripped) the shard backs off; transient HTTP
// errors/timeouts back off and retry (never advance a cursor — there is none to corrupt).
//
// Run (detached, supervised): see scripts/run-supervised.sh
//   node scripts/backfill-llm-enrich-drive.mjs

const FN = 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-llm-enrich';
const SECRET = process.env.WEBHOOK_SECRET || 'meilisearch-sync-webhook-2026';
const BATCH = Number(process.env.BATCH || 15);
// One-time regression cleanup: re-scan rows stamped classified_at but stuck at NULL relevance.
const RETRY_RELEVANCE_NULL = process.env.RETRY_RELEVANCE_NULL === '1';
const SHARDS = [
  ['00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000000'],
  ['40000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000000'],
  ['80000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000'],
  ['c0000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function fetchT(url, opts, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function call(target, idGte, idLt) {
  const res = await fetchT(FN, {
    method: 'POST',
    headers: { 'x-webhook-secret': SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, batch_size: BATCH, id_gte: idGte, id_lt: idLt, retry_relevance_null: RETRY_RELEVANCE_NULL }),
  }, 120000);
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
  return JSON.parse(body);
}

const totals = {}; // per-target running totals

async function runShard(target, [lo, hi]) {
  let backoff = 5000;
  for (;;) {
    let r;
    try { r = await call(target, lo, hi); }
    catch (e) {
      console.error(`[${ts()}] ${target} shard ${lo.slice(0, 8)} error: ${e.message} — retry in ${backoff / 1000}s`);
      await sleep(backoff); backoff = Math.min(backoff * 2, 120000); continue;
    }
    backoff = 5000;
    if (r.circuit_open) {
      console.warn(`[${ts()}] ${target} shard ${lo.slice(0, 8)} circuit_open — backing off 60s`);
      await sleep(60000); continue;
    }
    if (!r.processed) { console.log(`[${ts()}] ${target} shard ${lo.slice(0, 8)} DONE`); return; }
    const t = (totals[target] ??= { processed: 0, updated: 0, geo: 0, failed: 0 });
    t.processed += r.processed; t.updated += r.updated || 0; t.geo += r.geo || 0; t.failed += r.failed || 0;
    if (t.processed % 300 < BATCH)
      console.log(`[${ts()}] ${target}: processed=${t.processed} updated=${t.updated} geo=${t.geo} failed=${t.failed}`);
  }
}

async function runTarget(target) {
  console.log(`[${ts()}] === ${target}: starting ${SHARDS.length} shards (batch=${BATCH}) ===`);
  await Promise.all(SHARDS.map((s) => runShard(target, s)));
  const t = totals[target] || {};
  console.log(`[${ts()}] === ${target} COMPLETE: processed=${t.processed || 0} updated=${t.updated || 0} geo=${t.geo || 0} failed=${t.failed || 0} ===`);
}

async function main() {
  const targets = (process.env.TARGETS || 'news,events').split(',').map((s) => s.trim()).filter(Boolean);
  for (const t of targets) await runTarget(t);
  console.log(`[${ts()}] ALL DONE.`);
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
