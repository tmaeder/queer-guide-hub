#!/usr/bin/env node
// Drives the classify-relevance-backfill edge function across entity types until each is
// drained. Resumable (the function tracks progress via classified_at). Personalities excluded.
// Run: node scripts/backfill-relevance-classify.mjs
const FN = 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/classify-relevance-backfill';
// Supabase anon (publishable) key — provide via env, do not hardcode:
//   SB_ANON=$(... your project's anon key ...) node scripts/backfill-relevance-classify.mjs
const ANON = process.env.SB_ANON;
if (!ANON) { console.error('SB_ANON env var required (Supabase anon key)'); process.exit(1); }
const TYPES = ['venue', 'event', 'marketplace', 'news'];
const BATCH = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function callBatch(entity_type) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 120000);
  try {
    const res = await fetch(FN, {
      method: 'POST', signal: ac.signal,
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type, batch_size: BATCH }),
    });
    if (!res.ok) return { error: `http ${res.status}` };
    return await res.json();
  } catch (e) { return { error: String(e) }; } finally { clearTimeout(t); }
}

async function main() {
  for (const type of TYPES) {
    console.log(`[${ts()}] === ${type} ===`);
    let scored = 0, unknown = 0, batches = 0, deadAir = 0;
    for (;;) {
      const r = await callBatch(type);
      if (r.error) { console.log(`[${ts()}] ${type} error: ${r.error} (retry 10s)`); await sleep(10000); deadAir++; if (deadAir > 30) { console.log(`[${ts()}] ${type} giving up`); break; } continue; }
      if (r.done || r.batch === 0) { console.log(`[${ts()}] ${type} DRAINED. scored=${scored} unknown=${unknown}`); break; }
      scored += r.ok || 0; unknown += r.failed || 0; batches++;
      if ((r.ok || 0) + (r.failed || 0) === 0) { deadAir++; } else { deadAir = 0; }
      if (deadAir > 8) { console.log(`[${ts()}] ${type} all-retry x${deadAir}, backing off 30s`); await sleep(30000); }
      if (batches % 10 === 0) console.log(`[${ts()}] ${type} batches=${batches} scored=${scored} unknown=${unknown} (last ok=${r.ok} unk=${r.failed} retry=${r.retry})`);
      await sleep(r.retry > BATCH / 2 ? 8000 : 400);
    }
  }
  console.log(`[${ts()}] ALL DONE`);
}
main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
