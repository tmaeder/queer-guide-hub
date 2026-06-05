#!/usr/bin/env node
// Backfill latitude/longitude for live events (duplicate_of_id IS NULL) that lack coords.
// Writes through the Supabase Management API (no DB password locally).
//
// Data reality (2026-06-05): all 1,855 geocodable events already carry a correct city_id
// (→ country_id), and every linked city has coords. Only ~31 events have a street address or
// venue_name worth precise geocoding; the rest are city-level (Pride, street fairs).
//
// Two passes:
//   A. Photon forward-geocode the address/venue-bearing events, COUNTRY-VALIDATED
//      (reject results whose countrycode != event.country ISO2). Precise point.
//   B. Inherit the linked city's lat/lng for everyone still missing coords. Country-safe
//      by construction (city_id was already resolved + country-consistent). No external API.
//
// Because every row has a city-coord fallback, `latitude IS NULL` is a perfect resume cursor:
// re-running only re-touches rows that still lack coords, and the job terminates when none remain.
//
// The trg_event_geocode trigger is suppressed here — its WHEN clause is (NEW.city_id IS NULL)
// and every row already has a city_id, so updating coords does NOT fan out pg_net→Nominatim.
//
// Per-row (Pass A) / small-batch (Pass B) writes stay under the search_documents_sync() reindex
// trigger statement-timeout (bulk event writes time out).
//
// Run: GEOCODE_TOKEN=sbp_... node scripts/backfill-event-geocode.mjs
// Token: RAW=$(security find-generic-password -s "Supabase CLI" -w); echo "${RAW#go-keyring-base64:}" | base64 -d

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;
const PHOTON = process.env.PHOTON_URL || 'https://photon.komoot.io/api';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) QueerGuide/1.0 (contact@queer.guide)';
const SLEEP_MS = Number(process.env.SLEEP_MS || 1500); // gentle: venue job already uses Photon ~1/s
const INHERIT_BATCH = 200; // <=300 per the reindex-trigger timeout guidance

if (!TOKEN) { console.error('GEOCODE_TOKEN not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (s) => (s == null ? null : String(s).replace(/'/g, "''"));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function fetchT(url, opts = {}, timeoutMs = 15000) {
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
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ query: sql }),
      }, 30000);
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 * (i + 1)); // also covers DNS/network blips (ENOTFOUND, abort)
    }
  }
}

async function photon(q, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(`${PHOTON}?q=${encodeURIComponent(q)}&limit=1`, { headers: { 'User-Agent': UA } }, 8000);
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      if (!res.ok) return null;
      const j = await res.json();
      const f = j.features && j.features[0];
      if (!f) return null;
      return {
        lat: f.geometry?.coordinates?.[1],
        lon: f.geometry?.coordinates?.[0],
        cc: (f.properties?.countrycode || '').toUpperCase(),
      };
    } catch { if (i === tries - 1) return null; await sleep(2000 * (i + 1)); }
  }
  return null;
}

// Pass A — precise geocode for the handful of events with a street address / venue_name.
async function passPrecise() {
  const rows = await mgmt(
    `SELECT id, address, venue_name, city, country FROM events
     WHERE duplicate_of_id IS NULL AND latitude IS NULL
       AND (NULLIF(address,'') IS NOT NULL OR NULLIF(venue_name,'') IS NOT NULL)
     ORDER BY start_date DESC NULLS LAST`
  );
  console.log(`[${ts()}] Pass A (Photon precise): ${rows?.length || 0} address/venue events`);
  let located = 0, rejected = 0, noresult = 0;
  for (const e of rows || []) {
    try {
      const base = (e.address && e.address.trim()) || (e.venue_name && e.venue_name.trim()) || '';
      const q = [base, e.city, e.country].filter(Boolean).join(', ');
      const g = await photon(q);
      const ecc = (e.country || '').trim().toUpperCase();
      if (g && g.lat && g.lon && g.lat !== 0 && g.lon !== 0) {
        const countryOk = !ecc || !g.cc || ecc === g.cc;
        if (countryOk) {
          await mgmt(`UPDATE events SET latitude=${Number(g.lat)}, longitude=${Number(g.lon)}, updated_at=now() WHERE id='${e.id}'`);
          located++;
        } else { rejected++; } // leave null → Pass B gives city-center coords
      } else { noresult++; }
    } catch (err) {
      console.error(`[${ts()}] precise row ${e.id} error (skipping): ${err.message}`);
    }
    await sleep(SLEEP_MS);
  }
  console.log(`[${ts()}] Pass A done: located=${located} rejected=${rejected} noresult=${noresult} (rejected/noresult fall through to city coords)`);
}

// Pass B — inherit linked-city coords for every remaining event without coords.
async function passInherit() {
  console.log(`[${ts()}] Pass B (city-coord inherit): batches of ${INHERIT_BATCH}...`);
  let total = 0;
  for (;;) {
    const r = await mgmt(
      `WITH b AS (
         SELECT e.id, c.latitude AS lat, c.longitude AS lon
         FROM events e JOIN cities c ON c.id = e.city_id
         WHERE e.duplicate_of_id IS NULL AND e.latitude IS NULL
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND NOT (c.latitude = 0 AND c.longitude = 0)
         ORDER BY e.id LIMIT ${INHERIT_BATCH})
       , u AS (
         UPDATE events e SET latitude = b.lat, longitude = b.lon, updated_at = now()
         FROM b WHERE e.id = b.id RETURNING 1)
       SELECT count(*)::int n FROM u`
    );
    const n = r?.[0]?.n || 0;
    total += n;
    if (n === 0) break;
    console.log(`[${ts()}]   inherited ${total}...`);
  }
  console.log(`[${ts()}] Pass B done: ${total} events given city-center coords.`);
}

async function main() {
  const before = await mgmt(
    `SELECT count(*)::int n FROM events WHERE duplicate_of_id IS NULL AND latitude IS NULL
       AND (NULLIF(address,'') IS NOT NULL OR NULLIF(venue_name,'') IS NOT NULL OR NULLIF(city,'') IS NOT NULL)`
  );
  console.log(`[${ts()}] start: ${before?.[0]?.n} live geocodable events without coords`);
  await passPrecise();
  await passInherit();
  const after = await mgmt(
    `SELECT count(*)::int n FROM events WHERE duplicate_of_id IS NULL AND latitude IS NULL
       AND (NULLIF(address,'') IS NOT NULL OR NULLIF(venue_name,'') IS NOT NULL OR NULLIF(city,'') IS NOT NULL)`
  );
  console.log(`[${ts()}] DONE. remaining geocodable-without-coords: ${after?.[0]?.n}`);
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
