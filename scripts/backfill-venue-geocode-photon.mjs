#!/usr/bin/env node
// Country-validated venue geocoding via Photon, writing through the Supabase Management API.
// Resumable: drives off venues.geocode_attempted. Per-row writes to stay under the
// search_documents_sync() reindex trigger statement-timeout (bulk venue writes time out).
//
// Run: GEOCODE_TOKEN=sbp_... node scripts/backfill-venue-geocode-photon.mjs
// Token: RAW=$(security find-generic-password -s "Supabase CLI" -w); echo "${RAW#go-keyring-base64:}" | base64 -d

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;
const PHOTON = process.env.PHOTON_URL || 'https://photon.komoot.io/api';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) QueerGuide/1.0 (contact@queer.guide)';
const SLEEP_MS = Number(process.env.SLEEP_MS || 1100);
const SELECT_BATCH = 50;

if (!TOKEN) { console.error('GEOCODE_TOKEN not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (s) => (s == null ? null : String(s).replace(/'/g, "''"));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function mgmt(sql, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(MGMT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ query: sql }),
      });
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

async function photon(q, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=1`, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { await sleep(3000 * (i + 1)); continue; }
      if (!res.ok) return null;
      const j = await res.json();
      const f = j.features && j.features[0];
      if (!f) return null;
      return {
        lat: f.geometry?.coordinates?.[1],
        lon: f.geometry?.coordinates?.[0],
        cc: (f.properties?.countrycode || '').toUpperCase(),
        city: f.properties?.city || f.properties?.town || f.properties?.village || f.properties?.county || null,
      };
    } catch { if (i === tries - 1) return null; await sleep(2000 * (i + 1)); }
  }
  return null;
}

async function resetPriorFailures() {
  console.log(`[${ts()}] reset phase: re-queuing prior failed attempts (300-row batches)...`);
  let total = 0;
  for (;;) {
    const r = await mgmt(
      `WITH b AS (SELECT id FROM venues WHERE duplicate_of_id IS NULL AND (latitude IS NULL OR longitude IS NULL)
         AND address IS NOT NULL AND address<>'' AND COALESCE(geocode_attempted,false)=true
         ORDER BY id LIMIT 300),
       u AS (UPDATE venues v SET geocode_attempted=false FROM b WHERE v.id=b.id RETURNING 1)
       SELECT count(*)::int n FROM u`
    );
    const n = r?.[0]?.n || 0;
    total += n;
    if (n === 0) break;
    if (total % 1500 === 0) console.log(`[${ts()}]   reset ${total}...`);
  }
  console.log(`[${ts()}] reset phase done: ${total} re-queued.`);
}

async function main() {
  await resetPriorFailures();
  console.log(`[${ts()}] geocode phase starting (sleep ${SLEEP_MS}ms/req)...`);
  let processed = 0, located = 0, rejected = 0, noresult = 0;
  for (;;) {
    const rows = await mgmt(
      `SELECT id, address, country, city FROM venues
       WHERE duplicate_of_id IS NULL AND (latitude IS NULL OR longitude IS NULL)
         AND address IS NOT NULL AND address<>'' AND COALESCE(geocode_attempted,false)=false
       ORDER BY id LIMIT ${SELECT_BATCH}`
    );
    if (!rows || rows.length === 0) break;
    for (const v of rows) {
      processed++;
      const g = await photon(v.address);
      const vcc = (v.country || '').trim().toUpperCase();
      let set = 'geocode_attempted=true, updated_at=now()';
      if (g && g.lat && g.lon && g.lat !== 0 && g.lon !== 0) {
        const countryOk = !vcc || !g.cc || vcc === g.cc;
        if (countryOk) {
          set += `, latitude=${Number(g.lat)}, longitude=${Number(g.lon)}`;
          if (!vcc && g.cc) set += `, country='${sq(g.cc)}'`;
          if ((!v.city || v.city === '') && g.city) set += `, city='${sq(g.city)}'`;
          located++;
        } else { rejected++; }
      } else { noresult++; }
      await mgmt(`UPDATE venues SET ${set} WHERE id='${v.id}'`);
      if (processed % 25 === 0)
        console.log(`[${ts()}] processed=${processed} located=${located} rejected=${rejected} noresult=${noresult}`);
      await sleep(SLEEP_MS);
    }
  }
  console.log(`[${ts()}] DONE. processed=${processed} located=${located} rejected=${rejected} noresult=${noresult}`);
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
