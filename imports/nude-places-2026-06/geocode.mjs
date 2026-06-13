#!/usr/bin/env node
// Geocode the coordless nude-places venues via Photon (country-validated, Null-Island-guarded),
// scoped to data_source='nude-places' so it does NOT re-run the site-wide backlog.
// Mirrors scripts/backfill-venue-geocode-photon.mjs but filtered + no global reset phase.
//
// Run: node imports/nude-places-2026-06/geocode.mjs

import { execSync } from 'node:child_process';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const PHOTON = process.env.PHOTON_URL || 'https://photon.komoot.io/api';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) QueerGuide/1.0 (contact@queer.guide)';
const SLEEP_MS = Number(process.env.SLEEP_MS || 1100);
const SOURCE = 'nude-places';

function token() {
  if (process.env.GEOCODE_TOKEN) return process.env.GEOCODE_TOKEN;
  const raw = execSync('security find-generic-password -s "Supabase CLI" -w').toString().trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString();
}
const TOKEN = token();

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
      await sleep(2000 * (i + 1));
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
        city: f.properties?.city || f.properties?.town || f.properties?.village || f.properties?.county || null,
      };
    } catch { if (i === tries - 1) return null; await sleep(2000 * (i + 1)); }
  }
  return null;
}

async function main() {
  console.log(`[${ts()}] geocoding ${SOURCE} venues (sleep ${SLEEP_MS}ms/req)...`);
  let processed = 0, located = 0, rejected = 0, noresult = 0;
  for (;;) {
    const rows = await mgmt(
      `SELECT id, address, country, city FROM public.venues
       WHERE data_source='${SOURCE}' AND duplicate_of_id IS NULL
         AND (latitude IS NULL OR longitude IS NULL)
         AND address IS NOT NULL AND address<>'' AND COALESCE(geocode_attempted,false)=false
       ORDER BY id LIMIT 50`
    );
    if (!rows || rows.length === 0) break;
    for (const v of rows) {
      processed++;
      try {
        const g = await photon(v.address);
        const vcc = (v.country || '').trim().toUpperCase();
        let set = 'geocode_attempted=true, updated_at=now()';
        if (g && g.lat && g.lon && g.lat !== 0 && g.lon !== 0) {
          const countryOk = !vcc || !g.cc || vcc === g.cc;
          if (countryOk) {
            set += `, latitude=${Number(g.lat)}, longitude=${Number(g.lon)}`;
            if ((!v.city || v.city === '') && g.city) set += `, city='${sq(g.city)}'`;
            located++;
          } else { rejected++; }
        } else { noresult++; }
        await mgmt(`UPDATE public.venues SET ${set} WHERE id='${v.id}'`);
      } catch (e) {
        console.error(`[${ts()}] row ${v.id} error (skipping): ${e.message}`);
      }
      if (processed % 25 === 0)
        console.log(`[${ts()}] processed=${processed} located=${located} rejected=${rejected} noresult=${noresult}`);
      await sleep(SLEEP_MS);
    }
  }
  console.log(`[${ts()}] DONE. processed=${processed} located=${located} rejected=${rejected} noresult=${noresult}`);
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
