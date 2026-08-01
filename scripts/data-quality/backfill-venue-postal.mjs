#!/usr/bin/env node
/**
 * Drain geo_address_queue: reverse-geocode coordinates → postal_code (+ state
 * where the entity's city has no region).
 *
 * The geo_address_drain cron does the same work at 25 rows / 5 min, which is
 * correct for steady state (a handful of new rows a day) but would take three
 * days for the ~21k historical venue backlog. Run this to clear the backlog:
 * one process, observable, abortable, and resumable — it pops from the same
 * queue, so stopping it just leaves the rest for the cron.
 *
 *   node scripts/data-quality/backfill-venue-postal.mjs --dry-run --limit 20
 *   node scripts/data-quality/backfill-venue-postal.mjs            # overnight
 *
 * Auth: Supabase Management API via the macOS-keychain CLI token (house
 *   pattern, same as backfill-venue-geo.mjs; set SUPABASE_PAT to override).
 *
 * Pacing: 1100ms. That is the interval this repo has empirically found Photon
 * tolerates for sustained bulk use. ~21k rows is therefore ~6.5 hours — plan it
 * as an overnight run, and do not lower the interval without watching for 429s
 * across a few hundred requests first.
 *
 * Writes touch state, postal_code and country_id. The first two fire nothing but
 * the search_documents sync — venue_coord_guard_trg and trg_venue_geocode are
 * scoped to coords/city/address and stay out of it. country_id DOES reach the
 * derive trigger and recomputes safety_gated, which is correct (a venue that
 * just learned it is in a criminalizing country must be gated) and is why every
 * write is coalesce-guarded to fill NULLs only.
 */

import { execFileSync } from 'node:child_process';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || Infinity;
const BATCH = 60; // rows claimed per round
const INTERVAL_MS = Number(process.env.PHOTON_INTERVAL_MS || 1100);
const PHOTON = 'https://photon.komoot.io/reverse';
const UA = 'queer.guide-dataquality/1.0 (tmaeder@me.com)';

const TABLES = {
  venue: 'venues',
  event: 'events',
  hotel: 'hotels',
  organization: 'organizations',
};

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}
const TOKEN = token();

/**
 * Retries transient failures. This is a multi-hour run against a hosted API:
 * a single 502 from the edge in front of the Management API killed a 960-row
 * pass outright before this existed. Nothing was lost — the queue is the work
 * list and rows are only deleted after a successful write — but the job has to
 * survive a blip rather than needing a babysitter.
 */
async function sql(query, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    if (attempt >= 5) throw e;
    await sleep(2000 * 2 ** attempt);
    return sql(query, attempt + 1);
  }
  if (res.ok) return res.json();
  const body = (await res.text()).slice(0, 300);
  // 5xx and 429 are transient; a 4xx is our own bad SQL and must surface.
  if ((res.status >= 500 || res.status === 429) && attempt < 5) {
    console.error(`  mgmt API ${res.status}, retry ${attempt + 1}/5`);
    await sleep(2000 * 2 ** attempt);
    return sql(query, attempt + 1);
  }
  throw new Error(`mgmt API ${res.status}: ${body}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function reverse(lat, lon) {
  // &lang=en is required or regions come back in mixed languages and will not group.
  const res = await fetch(`${PHOTON}?lat=${lat}&lon=${lon}&lang=en`, { headers: { 'User-Agent': UA } });
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`photon_${res.status}`);
  const j = await res.json();
  const p = j?.features?.[0]?.properties ?? {};
  // `state` only — Photon's county for Los Angeles is "Los Angeles", not a state.
  // countrycode comes back in the same response; it is the only way a venue with
  // coordinates but no city link and no country text can ever get a country.
  return {
    state: p.state?.trim() || null,
    postcode: p.postcode?.trim() || null,
    countrycode: p.countrycode?.trim().toUpperCase().slice(0, 2) || null,
  };
}

let done = 0, filled = 0, empty = 0, failed = 0;

for (;;) {
  if (done >= LIMIT) break;
  const rows = await sql(`
    select entity_type, entity_id, latitude, longitude, attempts
    from public.geo_address_queue
    where attempts < 4 and next_attempt_at <= now()
    order by next_attempt_at
    limit ${BATCH}`);
  if (!rows.length) break;

  const writes = {}; // table -> [{id, state, postcode}]
  const drop = [];

  for (const r of rows) {
    if (done >= LIMIT) break;
    done++;
    try {
      if (r.latitude == null || r.longitude == null) throw new Error('no_coords');
      const geo = await reverse(Number(r.latitude), Number(r.longitude));
      const table = TABLES[r.entity_type];
      if (geo.postcode || geo.state || geo.countrycode) {
        (writes[table] ??= []).push({ id: r.entity_id, ...geo });
        filled++;
      } else {
        // A real "this place has no postcode" answer (city-states, micro-states).
        // Not a failure — drop it so we never ask again.
        empty++;
      }
      drop.push(r);
    } catch (e) {
      failed++;
      const attempts = (r.attempts ?? 0) + 1;
      const hours = Math.pow(2, attempts);
      if (!DRY) {
        await sql(`update public.geo_address_queue
                      set attempts = ${attempts},
                          last_error = ${q(String(e.message).slice(0, 500))},
                          next_attempt_at = now() + interval '${hours} hours'
                    where entity_type = ${q(r.entity_type)} and entity_id = ${q(r.entity_id)}::uuid`);
      }
      if (String(e.message) === 'rate_limited') {
        console.error('  429 — backing off 30s');
        await sleep(30_000);
      }
    }
    await sleep(INTERVAL_MS);
  }

  if (!DRY) {
    for (const [table, items] of Object.entries(writes)) {
      if (!items.length) continue;
      const values = items
        .map(
          (i) =>
            `(${q(i.id)}::uuid, ${i.state ? q(i.state) : 'null'}, ${i.postcode ? q(i.postcode) : 'null'}, ${i.countrycode ? q(i.countrycode) : 'null'})`,
        )
        .join(',');
      // coalesce = NULL-fill only; never overwrite what a source supplied.
      // country_id resolves from Photon's countrycode via a plain code lookup —
      // unlike the free-text `country` column, a countrycode derived from
      // coordinates is unambiguous and needs no corroboration. Filling it fires
      // the derive trigger, which recomputes safety_gated; that is why the
      // coalesce guard matters.
      await sql(`update public.${table} t
                    set state = coalesce(t.state, v.state),
                        postal_code = coalesce(t.postal_code, v.postcode),
                        country_id = coalesce(t.country_id, co.id)
                  from (values ${values}) as v(id, state, postcode, cc)
                  left join public.countries co
                         on upper(co.code) = v.cc and co.duplicate_of_id is null
                  where t.id = v.id`);
    }
    if (drop.length) {
      const pairs = drop.map((r) => `(${q(r.entity_type)}, ${q(r.entity_id)}::uuid)`).join(',');
      await sql(`delete from public.geo_address_queue qq
                 using (values ${pairs}) as v(t, i)
                 where qq.entity_type = v.t and qq.entity_id = v.i`);
    }
  }

  console.error(`${done} processed — ${filled} filled, ${empty} no-postcode, ${failed} failed`);
}

console.error(`done: ${done} processed, ${filled} filled, ${empty} legitimately empty, ${failed} failed`);
