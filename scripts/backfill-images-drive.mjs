#!/usr/bin/env node
// Driver for the image-backfill edge functions (Wikipedia/Pexels → storage, not DB disk).
// Loops a function's batch endpoint until it reports no more candidates. Paces gently to
// respect Pexels rate limits and backs off on transient errors. Resumable: the functions
// drive off image_url IS NULL, so a restart just continues.
//
// Run: SERVICE_KEY=eyJ... FN=backfill-cities-images node scripts/backfill-images-drive.mjs
//   (FN default: backfill-cities-images; BATCH default 10; SLEEP_MS default 6000)

const PROJECT = 'xqeacpakadqfxjxjcewc';
const FN = process.env.FN || 'backfill-cities-images';
const URL = `https://${PROJECT}.supabase.co/functions/v1/${FN}`;
const KEY = process.env.SERVICE_KEY;
const BATCH = Number(process.env.BATCH || 10);
const SLEEP_MS = Number(process.env.SLEEP_MS || 6000);

if (!KEY) { console.error('SERVICE_KEY not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function fetchT(url, opts, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function main() {
  console.log(`[${ts()}] image backfill via ${FN} (batch=${BATCH}, sleep=${SLEEP_MS}ms)`);
  let totUpdated = 0, totNoImage = 0, totFailed = 0, empties = 0, backoff = 10000;
  for (;;) {
    let r;
    try {
      const res = await fetchT(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_size: BATCH }),
      }, 120000);
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 140)}`);
      r = JSON.parse(body);
    } catch (e) {
      console.error(`[${ts()}] error: ${e.message} — retry in ${backoff / 1000}s`);
      await sleep(backoff); backoff = Math.min(backoff * 2, 120000); continue;
    }
    backoff = 10000;
    const cand = r.candidates ?? 0;
    if (!cand) { console.log(`[${ts()}] DONE — no more candidates. updated=${totUpdated} no_image=${totNoImage} failed=${totFailed}`); return; }
    totUpdated += r.updated || 0; totNoImage += r.no_image || 0; totFailed += r.failed || 0;
    // If a whole batch produced nothing usable repeatedly, the remainder is genuinely unfindable.
    if ((r.updated || 0) === 0) { empties++; if (empties >= 8) { console.log(`[${ts()}] STOP — 8 consecutive no-result batches; remainder unfindable. updated=${totUpdated}`); return; } }
    else empties = 0;
    console.log(`[${ts()}] updated=${totUpdated} no_image=${totNoImage} failed=${totFailed}`);
    await sleep(SLEEP_MS);
  }
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
