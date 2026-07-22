#!/usr/bin/env node
// Operator driver for the queer-imagery-backfill edge function.
//
// Re-images cities/countries (and gap-fills events) with queer + place-connected
// photos. Loops the function's batch endpoint until it reports nothing due; the
// function advances a resumable enrichment_log cursor, so hits AND misses both
// move the pass forward and a restart just continues. Misses are expected (many
// small towns have no queer imagery) and keep their existing image — they are
// NOT an error and do not stop the loop.
//
// Run:
//   SERVICE_KEY=eyJ... node scripts/data-quality/backfill-queer-imagery.mjs --entity=city
//   ... --entity=country | --entity=event   (run each separately)
// Flags:
//   --entity=city|country|event   (required)
//   --limit=40                    batch size (edge fn clamps to 1..100)
//   --dry-run                     score + report, write nothing
//   --max-batches=N               stop after N batches (default: unlimited)
//   --sleep=4000                  ms between batches (Pexels/Unsplash rate limits)

const PROJECT = 'xqeacpakadqfxjxjcewc';
const URL = `https://${PROJECT}.supabase.co/functions/v1/queer-imagery-backfill`;
const KEY = process.env.SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

const ENTITY = getArg('entity');
const LIMIT = Number(getArg('limit', 40));
const DRY_RUN = getArg('dry-run', false) === true;
const MAX_BATCHES = Number(getArg('max-batches', 0)); // 0 = unlimited
const SLEEP_MS = Number(getArg('sleep', 4000));

if (!KEY) { console.error('SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) not set'); process.exit(1); }
if (!['city', 'country', 'event'].includes(ENTITY)) {
  console.error('--entity must be one of: city, country, event'); process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function fetchT(url, opts, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function main() {
  console.log(`[${ts()}] queer-imagery backfill entity=${ENTITY} limit=${LIMIT} dry_run=${DRY_RUN} sleep=${SLEEP_MS}ms`);
  let totProcessed = 0, totHits = 0, totMisses = 0, batches = 0, backoff = 10000;
  for (;;) {
    if (MAX_BATCHES && batches >= MAX_BATCHES) {
      console.log(`[${ts()}] STOP — reached --max-batches=${MAX_BATCHES}. processed=${totProcessed} hits=${totHits} misses=${totMisses}`);
      return;
    }
    let r;
    try {
      const res = await fetchT(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: ENTITY, batch_size: LIMIT, dry_run: DRY_RUN }),
      }, 180000);
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
      r = JSON.parse(body);
    } catch (e) {
      console.error(`[${ts()}] error: ${e.message} — retry in ${backoff / 1000}s`);
      await sleep(backoff); backoff = Math.min(backoff * 2, 120000); continue;
    }
    backoff = 10000;
    batches++;
    const processed = r.processed ?? 0;
    if (!processed) {
      console.log(`[${ts()}] DONE — nothing due. processed=${totProcessed} hits=${totHits} misses=${totMisses}`);
      return;
    }
    totProcessed += processed; totHits += r.hits || 0; totMisses += r.misses || 0;
    // Dry-run does not write the enrichment_log cursor, so the same rows return
    // every batch — cap it to one batch to avoid an infinite loop.
    console.log(`[${ts()}] batch ${batches}: processed=${processed} hits=${r.hits || 0} misses=${r.misses || 0} | total hits=${totHits}/${totProcessed}`);
    if (DRY_RUN) {
      console.log(`[${ts()}] dry-run — stopping after one batch (no cursor advance).`);
      return;
    }
    await sleep(SLEEP_MS);
  }
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
