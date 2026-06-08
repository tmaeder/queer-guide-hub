#!/usr/bin/env node
// Drives the venue-photo-foursquare edge fn (keyset by id) until imageless venues are drained.
// REQUIRES Foursquare account credits — bails if it sees sustained 429 (out of credits).
// Run: SB_ANON=<anon jwt> node scripts/backfill-venue-photos.mjs
const FN = 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/venue-photo-foursquare';
const ANON = process.env.SB_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function main() {
  let after = '00000000-0000-0000-0000-000000000000', total = 0, found = 0, batches = 0, creditFail = 0;
  for (;;) {
    let r;
    try {
      const res = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_size: 25, after }) });
      r = await res.json();
    } catch (e) { console.log(`[${ts()}] err ${e}; retry 10s`); await sleep(10000); continue; }
    if (r.error) { console.log(`[${ts()}] fn error: ${r.error}`); break; }
    if (r.done) { console.log(`[${ts()}] DONE. total=${total} found=${found}`); break; }
    after = r.last; total += r.processed || 0; found += r.found || 0; batches++;
    if (r.nocredits >= (r.processed || 0) && r.processed > 0) { creditFail++; if (creditFail >= 3) { console.log(`[${ts()}] ABORT: Foursquare account has no credits (429). Add credits then re-run.`); break; } }
    else creditFail = 0;
    if (batches % 10 === 0) console.log(`[${ts()}] batches=${batches} total=${total} found=${found} (${Math.round(100*found/total)}%) after=${after}`);
    await sleep(250);
  }
}
main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
