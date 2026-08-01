#!/usr/bin/env node
/**
 * Backfill cities.region_name by reverse-geocoding each city's coordinates.
 *
 * WHY THIS IS THE HIGHEST-LEVERAGE JOB IN THE ADDRESS WORK
 * -------------------------------------------------------
 * `state` was empty on 22,006 venues, 39,068 events and every hotel. Filling it
 * per-entity would be ~61,000 geocoder round-trips. But `state` is a property of
 * the CITY, not of the venue inside it — so geocoding the ~1,900 cities that
 * lack a region and then deriving downstream is the same answer for 3% of the
 * requests, and it keeps working for every row inserted afterwards (the
 * derive_entity_geo_address trigger reads cities.region_name).
 *
 * PROVIDER: Photon (komoot). Free, no API key, already used elsewhere in this
 * repo. `&lang=en` is REQUIRED — without it you get "Bayern" for some rows and
 * "Bavaria" for others, and the resulting `state` values will not group.
 *
 * Some cities legitimately have no region: city-states and micro-states
 * (Berlin, Singapore, Monaco, Vatican City) return state=null from Photon. That
 * is recorded as a miss and never retried in a later pass; do not "fix" it by
 * falling back to `county` (Photon returns county="Los Angeles" for LA, which
 * is emphatically not a state).
 *
 * READS use the public anon key (cities are world-readable). WRITES are not
 * possible with that key under RLS, so by default this prints batched SQL to
 * stdout for an operator to apply. With SUPABASE_SERVICE_KEY set it writes
 * directly.
 *
 * Batch the writes at <=300 rows: city UPDATEs fan out through
 * trg_sync_geo_spine into geo_city_profiles.
 *
 *   node scripts/data-quality/backfill-city-region.mjs --limit 50 --dry-run
 *   node scripts/data-quality/backfill-city-region.mjs --out /tmp/region.sql
 */

import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const PHOTON = process.env.PHOTON_REVERSE_URL || 'https://photon.komoot.io/reverse';

// 1100ms is the interval this repo has empirically found Photon tolerates for
// sustained bulk use (see backfill-venue-geo.mjs). Lower it only after watching
// for 429s across a few hundred requests.
const INTERVAL_MS = Number(process.env.PHOTON_INTERVAL_MS || 1100);
const WRITE_BATCH = 300;

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const DRY_RUN = args.includes('--dry-run');
const LIMIT = Number(flag('limit', 5000));
const OUT = flag('out', null);

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Cities with coordinates but no region. tmp- slugs are placeholder stubs. */
async function loadCities() {
  const url =
    `${SUPABASE_URL}/rest/v1/cities` +
    `?select=id,name,latitude,longitude` +
    `&region_name=is.null&duplicate_of_id=is.null` +
    `&latitude=not.is.null&longitude=not.is.null` +
    `&slug=not.like.tmp-*` +
    `&order=id.asc&limit=${LIMIT}`;
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!res.ok) throw new Error(`load cities ${res.status}: ${await res.text()}`);
  return res.json();
}

async function reverseGeocode(lat, lon) {
  const url = `${PHOTON}?lat=${lat}&lon=${lon}&lang=en`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'QueerGuide/1.0 (https://queer.guide)' } });
    if (res.status === 429) return { rateLimited: true };
    if (!res.ok) return {};
    const j = await res.json();
    const p = j?.features?.[0]?.properties ?? {};
    // `state` ONLY. county is not a state.
    return { state: p.state?.trim() || null, countrycode: p.countrycode?.trim() || null };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

function buildSql(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const chunk = rows.slice(i, i + WRITE_BATCH);
    const values = chunk.map((r) => `(${sqlQuote(r.id)}::uuid, ${sqlQuote(r.state)})`).join(',\n    ');
    out.push(
      `update public.cities c\n` +
        `   set region_name = v.region\n` +
        `from (values\n    ${values}\n) as v(id, region)\n` +
        `where c.id = v.id and c.region_name is null;`,
    );
  }
  return out.join('\n\n');
}

async function writeDirect(rows) {
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const chunk = rows.slice(i, i + WRITE_BATCH);
    for (const r of chunk) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cities?id=eq.${r.id}&region_name=is.null`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ region_name: r.state }),
      });
      if (!res.ok) console.warn(`  write ${r.id} failed ${res.status}`);
    }
    console.error(`  wrote ${Math.min(i + WRITE_BATCH, rows.length)}/${rows.length}`);
  }
}

const cities = await loadCities();
console.error(`${cities.length} cities need a region (coords present, not a tmp- stub)`);
if (!cities.length) process.exit(0);

const resolved = [];
let misses = 0;
let rateLimits = 0;

for (let i = 0; i < cities.length; i++) {
  const c = cities[i];
  const r = await reverseGeocode(c.latitude, c.longitude);
  if (r.rateLimited) {
    rateLimits++;
    console.error(`  429 at ${i} — backing off 30s`);
    await sleep(30_000);
    i--; // retry this city
    continue;
  }
  if (r.state) resolved.push({ id: c.id, state: r.state });
  else misses++;

  if ((i + 1) % 100 === 0) {
    console.error(`  ${i + 1}/${cities.length} — ${resolved.length} resolved, ${misses} region-less`);
  }
  if (i < cities.length - 1) await sleep(INTERVAL_MS);
}

console.error(`done: ${resolved.length} resolved, ${misses} legitimately region-less, ${rateLimits} rate-limit pauses`);

if (DRY_RUN) {
  console.error('--dry-run: no writes');
  console.error(resolved.slice(0, 10));
} else if (SERVICE_KEY) {
  await writeDirect(resolved);
} else {
  const sql = buildSql(resolved);
  if (OUT) {
    writeFileSync(OUT, sql);
    console.error(`SQL written to ${OUT} (${Math.ceil(resolved.length / WRITE_BATCH)} statements)`);
  } else {
    process.stdout.write(sql);
  }
}
