#!/usr/bin/env node
/**
 * Repair venues whose stored country contradicts their own coordinates.
 *
 * GATE (the whole point): only rows where the venue's Spartacus map
 * coordinate sits >500 km from the city it is linked to. That distance is an
 * INDEPENDENT signal — comparing venues.country against cities.country_id is
 * circular, because city_id was set by the same bad import that set the
 * country, and it "confirms" the wrong answer 887 times out of 892.
 *
 * 500 km is not arbitrary: below it every case is genuine geopolitical
 * ambiguity (FR/GP/MQ/RE overseas departments at 0 km, VA/IT and CN/MO
 * enclaves at 1 km, BE/DE and LU/DE border towns at 26-40 km). Those 50 rows
 * are deliberately left alone.
 *
 * city_id is CLEARED, not corrected. A null city_id is recoverable and the
 * coordinate-driven linkers will re-resolve it; a wrong one is not. Clearing
 * it in the SAME statement is also load-bearing: venue_coord_guard_trg NULLs
 * the coordinates of any venue >25 km from its linked city with a name-only
 * address, so leaving the wrong city_id in place would destroy the very
 * coordinates this repair is based on. A null city_id early-returns the guard.
 *
 * Idempotent + resumable: rows already carrying
 * enrichment_status->'country_repair' are skipped.
 *
 * TRAP — `v.country IS DISTINCT FROM <staging country>` is TRUE when the
 * staging value is NULL. Older Spartacus staging rows carry no country at
 * all, so without the `~ '^[A-Z]{2}$'` guard below they qualify as
 * "mismatched" and the repair writes NULL over a perfectly good value. That
 * happened: 717 venues holding correct countries ('CA','JP','KR','TN') were
 * blanked before the guard existed. They were recoverable only because the
 * audit stamp records `from_country` — which is the argument for writing the
 * before-value into enrichment_status BEFORE trusting the new one. A repair
 * you cannot un-do is not a repair.
 *
 * The two halves are independently justified and must not be conflated: the
 * >500 km distance proves the CITY LINK is wrong (so clearing city_id is
 * always right), but only a well-formed ISO-2 country in staging licenses
 * rewriting the COUNTRY. A row can legitimately earn the first and not the
 * second.
 *
 * AFTER RUNNING: verify country_id resolved. trg_venues_geo_derive routes
 * through resolve_country_from_text(), which returns NULL rather than guess
 * on ambiguous codes — and location_is_high_risk() reads country_id, so a
 * NULL there silently un-gates a venue in a criminalizing country. Measured:
 * 7 venues in ID/MA/TN were briefly public this way. Backfill country_id
 * straight from countries.code for repaired rows, then re-check that no
 * criminalizing venue is left ungated.
 */
import { execFileSync } from 'node:child_process';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const BATCH = 150; // per-row triggers + search_reindex enqueue; keep it modest

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sql(query, attempt = 1) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await sleep(2000 * attempt);
        return sql(query, attempt + 1);
      }
      throw new Error(`mgmt ${res.status}: ${body}`);
    }
    return res.json();
  } catch (e) {
    if (e instanceof Error && !/^mgmt \d/.test(e.message) && attempt < 5) {
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

const CANDIDATES = `
  select v.id,
         s.normalized_data->'location'->>'country' as sp_c,
         nullif(s.normalized_data->'location'->>'city','')  as sp_city
  from public.ingestion_staging s
  join public.venues v on v.id = s.target_record_id
  join public.cities ci on ci.id = v.city_id
  where s.source_name = 'spartacus'
    and s.target_table = 'venues'
    and s.disposition in ('inserted','updated')
    and v.country is distinct from s.normalized_data->'location'->>'country'
    and ci.latitude is not null and ci.longitude is not null
    and s.normalized_data->'location'->>'lat' is not null
    -- Only trust a staging row whose country is already ISO-2. Rows from
    -- imports predating 2026-08-21 store a DISPLAY NAME there ("Brazil"),
    -- and venues.country is CHECK-constrained to ISO-2
    -- (venues_country_iso2_check), so writing one aborts the batch.
    and s.normalized_data->'location'->>'country' ~ '^[A-Z]{2}$'
    and 111 * sqrt(
          power((s.normalized_data->'location'->>'lat')::float - ci.latitude::float, 2)
        + power(((s.normalized_data->'location'->>'lng')::float - ci.longitude::float)
                * cos(radians((s.normalized_data->'location'->>'lat')::float)), 2)
        ) > 500
    and v.enrichment_status->'country_repair' is null`;

const UPDATE = `
with cand as (${CANDIDATES} limit ${BATCH})
update public.venues v
set country     = cand.sp_c,
    country_id  = null,                     -- re-derived by trg_venues_geo_derive
    city_id     = null,                     -- wrong; null is recoverable
    city        = coalesce(cand.sp_city, v.city),
    state       = null,                     -- belonged to the wrong city
    needs_attention = true,
    enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
      'country_repair', jsonb_build_object(
        'at', now(),
        'source', 'spartacus_coord_gate',
        'from_country', v.country,
        'to_country', cand.sp_c,
        'cleared_city_id', v.city_id,
        'from_state', v.state,
        'reason', 'venue coordinate >500km from linked city'))
from cand
where v.id = cand.id
returning v.id`;

const before = await sql(`select count(*)::int as n from (${CANDIDATES}) t;`);
let remaining = Number((before.result ?? before)[0].n);
console.log(`[fix] ${remaining} rows pass the coordinate gate`);

let done = 0;
while (remaining > 0) {
  const res = await sql(`${UPDATE};`);
  const n = ((res.result ?? res) || []).length;
  if (!n) {
    console.warn('[fix] batch returned 0 with rows still matching — stopping');
    break;
  }
  done += n;
  const after = await sql(`select count(*)::int as n from (${CANDIDATES}) t;`);
  remaining = Number((after.result ?? after)[0].n);
  console.log(`[fix] repaired ${done}, ${remaining} remaining`);
}
console.log(`[fix] done — ${done} repaired`);
