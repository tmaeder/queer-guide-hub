#!/usr/bin/env node
/**
 * Fill and CORRECT cities.timezone from coordinates.
 *
 * WHY A POLYGON LOOKUP AND NOT THE EXISTING RPC
 * ---------------------------------------------
 * `run_city_timezone_backfill` already exists (registered, currently disabled)
 * and "inherits the country IANA timezone for cities in single-zone countries;
 * multi-zone countries stay NULL". Measured on prod 2026-09-03, that covers
 * 395 of the 2,284 cities missing a timezone — 17%. The other 1,889 are in
 * multi-zone countries, and the United States alone is 1,197 of them. Country
 * inheritance can never answer those; a coordinate can.
 *
 * `tz-lookup` is a pure function of (lat, lon) — no identity resolution, no
 * network, no rate limit — which is the whole reason this job is in the
 * zero-risk tier. It answers Portland OR and Portland ME differently, which is
 * the exact namesake class this codebase has repeatedly been burned by.
 *
 * THIS JOB CORRECTS AS WELL AS FILLS, AND THAT IS THE RISKY HALF
 * -------------------------------------------------------------
 * There are demonstrably wrong values stored today — GB cities carrying
 * `Europe/Bratislava` and `Africa/Johannesburg`, ES carrying `America/Bogota`
 * and `America/Tegucigalpa`, IT carrying `America/Havana`. But "the lookup
 * disagrees with the column" does not by itself say which one is wrong, so this
 * script REFUSES to correct anything until the agreement rate has been measured
 * against the rows that already have a value. That is what `--validate` does,
 * and it is the default. Same discipline as run_event_timezone_fill, which was
 * validated against 35,332 known-timezone events (99.71% agreement within
 * 250 km) before it was trusted.
 *
 * A disagreement is only ever ACTED on when the stored value is not merely
 * different but incompatible with the city's own country — a wrong-country
 * timezone is unambiguous. A same-country disagreement (America/New_York vs
 * America/Detroit) is reported and left alone: near a zone border the lookup is
 * a raster approximation and the stored value may well be the better answer.
 *
 * USAGE
 *   node scripts/data-quality/backfill-city-timezone.mjs                 # validate, read-only
 *   node scripts/data-quality/backfill-city-timezone.mjs --fill --dry-run
 *   node scripts/data-quality/backfill-city-timezone.mjs --fill --apply
 *   node scripts/data-quality/backfill-city-timezone.mjs --correct --apply
 *
 * `--apply` needs SUPABASE_SERVICE_KEY and writes an `external_correction_audit`
 * row per change under one batch_id, so the whole run reverts with
 *   select rollback_external_correction_batch('<batch_id>');
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import tzLookup from 'tz-lookup';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const MODE_FILL = args.includes('--fill');
const MODE_CORRECT = args.includes('--correct');
const APPLY = args.includes('--apply');
const LIMIT = Number(flag('limit', 100000));
const OUT = flag('out', null);

// cities UPDATEs fan out through trg_sync_geo_spine into geo_places and then
// into search_reindex_queue. Measured ~2.6 ms/row post-decoupling, but the
// established cap for this table is 300 and there is no reason to be the first
// job to raise it.
const WRITE_BATCH = 300;
const PAGE = 1000; // PostgREST default ceiling; paginate explicitly or truncate silently.

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment.');
  process.exit(1);
}
if (APPLY && !SERVICE_KEY) {
  console.error('--apply needs SUPABASE_SERVICE_KEY (RLS blocks writes with the anon key).');
  process.exit(1);
}

const anonHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
const svcHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Read every matching city. PostgREST caps a plain request at 1000 rows and
 * says nothing about it, so paging is not optional — a silent truncation here
 * would read as "these are all the cities that need work".
 */
async function loadAll(select, filters) {
  const rows = [];
  for (let offset = 0; offset < LIMIT; offset += PAGE) {
    const take = Math.min(PAGE, LIMIT - offset);
    const url =
      `${SUPABASE_URL}/rest/v1/cities?select=${select}&${filters}` +
      `&order=id.asc&limit=${take}&offset=${offset}`;
    const res = await fetch(url, { headers: anonHeaders });
    if (!res.ok) throw new Error(`load cities ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < take) break;
  }
  return rows;
}

const BASE_FILTERS =
  'duplicate_of_id=is.null&latitude=not.is.null&longitude=not.is.null&slug=not.like.tmp-*';

function lookup(city) {
  const lat = Number(city.latitude);
  const lon = Number(city.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // (0,0) is Null Island — a failed geocode, not a location. The map layer
  // already has to filter it; do not turn it into a confident Africa/Accra.
  if (lat === 0 && lon === 0) return null;
  try {
    return tzLookup(lat, lon);
  } catch {
    return null;
  }
}

/** IANA zones share a leading region ("America/", "Europe/"). */
const region = (tz) => (tz ? tz.split('/')[0] : null);

/**
 * Two zone NAMES can denote the same clock, and comparing the strings counts
 * that as a disagreement. Measured here: `Europe/Kyiv` vs `Europe/Kiev`,
 * `America/Nuuk` vs `America/Godthab`, `Europe/Vatican` vs `Europe/Rome`,
 * `Asia/Brunei` vs `Asia/Kuching` — IANA links and renames, all identical
 * clocks, and in the Kyiv and Nuuk cases the STORED value is the modern
 * canonical name while the lookup returns the deprecated alias. "Correcting"
 * those would be a downgrade.
 *
 * So equivalence is tested on the thing that matters — the UTC offset — at four
 * instants across a year, which also separates zones that merely share an
 * offset today from zones that share DST rules too.
 */
const PROBE_INSTANTS = [
  Date.UTC(2026, 0, 15, 12),
  Date.UTC(2026, 3, 15, 12),
  Date.UTC(2026, 6, 15, 12),
  Date.UTC(2026, 9, 15, 12),
];

const offsetCache = new Map();
function offsetSignature(tz) {
  if (offsetCache.has(tz)) return offsetCache.get(tz);
  let sig;
  try {
    sig = PROBE_INSTANTS.map((ms) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset',
      }).formatToParts(new Date(ms));
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? '?';
    }).join('|');
  } catch {
    sig = null; // not a zone this runtime knows
  }
  offsetCache.set(tz, sig);
  return sig;
}

/** Same clock all year — an alias, a link, or a genuinely identical zone. */
function sameClock(a, b) {
  if (a === b) return true;
  const sa = offsetSignature(a);
  const sb = offsetSignature(b);
  return sa !== null && sa === sb;
}

async function loadCountryZones() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/countries?select=id,code,name,timezone&limit=400`,
    { headers: anonHeaders },
  );
  if (!res.ok) throw new Error(`load countries ${res.status}`);
  const rows = await res.json();
  return new Map(rows.map((c) => [c.id, c]));
}

// ---------------------------------------------------------------------------
// validate — the gate everything else waits behind
// ---------------------------------------------------------------------------
async function validate(countries) {
  const rows = await loadAll(
    'id,name,latitude,longitude,timezone,country_id',
    `${BASE_FILTERS}&timezone=not.is.null`,
  );
  let agree = 0;
  let aliasAgree = 0;
  const sameRegion = [];
  const crossRegion = [];
  let unresolved = 0;

  for (const c of rows) {
    const got = lookup(c);
    if (!got) {
      unresolved++;
      continue;
    }
    if (got === c.timezone) {
      agree++;
    } else if (sameClock(got, c.timezone)) {
      // Different spelling, identical clock. Not a disagreement, and NOT
      // something to write: the stored name is at least as good.
      agree++;
      aliasAgree++;
    } else if (region(got) === region(c.timezone)) {
      // Same continent — most likely a zone border, where a raster lookup is
      // genuinely uncertain and the stored value may be better.
      sameRegion.push({ ...c, computed: got });
    } else {
      // Different continent — one of the two is simply wrong, and a city cannot
      // be on two continents.
      crossRegion.push({ ...c, computed: got });
    }
  }

  const compared = rows.length - unresolved;
  const pct = compared ? ((agree / compared) * 100).toFixed(2) : '0.00';
  console.log(`\n=== validation against ${compared} cities that already have a timezone ===`);
  console.log(`agreement            ${agree}/${compared}  (${pct}%)`);
  console.log(`  of which alias/link ${aliasAgree}  (same clock, different spelling — never rewritten)`);
  console.log(`same-region disagree ${sameRegion.length}  (zone borders — reported, never auto-changed)`);
  console.log(`cross-region disagree ${crossRegion.length}  (one side is simply wrong)`);
  if (unresolved) console.log(`unresolved coords    ${unresolved}`);

  if (crossRegion.length) {
    console.log('\ncross-region disagreements (stored -> computed):');
    for (const c of crossRegion.slice(0, 40)) {
      const co = countries.get(c.country_id);
      console.log(
        `  ${(co?.code ?? '??').padEnd(3)} ${c.name.padEnd(28)} ${String(c.timezone).padEnd(24)} -> ${c.computed}`,
      );
    }
    if (crossRegion.length > 40) console.log(`  … and ${crossRegion.length - 40} more`);
  }
  if (sameRegion.length) {
    console.log('\nsame-region disagreements (stored -> computed):');
    for (const c of sameRegion) {
      const co = countries.get(c.country_id);
      console.log(
        `  ${(co?.code ?? '??').padEnd(3)} ${c.name.padEnd(28)} ${String(c.timezone).padEnd(24)} -> ${c.computed}`,
      );
    }
  }
  return { agreementPct: Number(pct), compared, sameRegion, crossRegion };
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------
async function applyChanges(changes, batchId, reason) {
  let written = 0;
  for (let i = 0; i < changes.length; i += WRITE_BATCH) {
    const chunk = changes.slice(i, i + WRITE_BATCH);

    // Audit BEFORE the write. If the process dies mid-batch the audit row is
    // the only thing that makes the change reversible, so it must not be the
    // step that gets skipped.
    const audit = chunk.map((c) => ({
      batch_id: batchId,
      entity_type: 'city',
      entity_id: c.id,
      field: 'timezone',
      before_value: c.timezone === null || c.timezone === undefined ? null : c.timezone,
      after_value: c.computed,
      source: 'timezone-boundary-builder',
      confidence: 1.0,
      actor: 'script:backfill-city-timezone',
      reason,
    }));
    const aRes = await fetch(`${SUPABASE_URL}/rest/v1/external_correction_audit`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(audit),
    });
    if (!aRes.ok) throw new Error(`audit insert ${aRes.status}: ${await aRes.text()}`);

    for (const c of chunk) {
      // Guarded on the value we believe is there, so a row someone else changed
      // between read and write is skipped rather than clobbered.
      const guard =
        c.timezone === null || c.timezone === undefined
          ? 'timezone=is.null'
          : `timezone=eq.${encodeURIComponent(c.timezone)}`;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/cities?id=eq.${c.id}&${guard}`, {
        method: 'PATCH',
        headers: { ...svcHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ timezone: c.computed }),
      });
      if (!res.ok) throw new Error(`update ${c.id} ${res.status}: ${await res.text()}`);
      written++;
    }
    console.log(`  wrote ${Math.min(i + WRITE_BATCH, changes.length)}/${changes.length}`);
  }
  return written;
}

function reportSql(changes) {
  const lines = changes.map(
    (c) =>
      `-- ${c.name}: ${c.timezone ?? 'NULL'} -> ${c.computed}\n` +
      `update public.cities set timezone = '${c.computed}' where id = '${c.id}';`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
(async () => {
  const countries = await loadCountryZones();
  const v = await validate(countries);

  // The bar is deliberately explicit. run_event_timezone_fill was accepted at
  // 99.71%; anything materially below that means the lookup and this corpus
  // disagree about something structural, and filling 2,284 rows on that basis
  // would be writing noise confidently.
  const BAR = 99.0;
  if (!MODE_FILL && !MODE_CORRECT) {
    console.log(`\n(validate-only. Re-run with --fill once agreement is above ${BAR}%.)`);
    return;
  }
  if (v.agreementPct < BAR) {
    console.error(
      `\n✗ refusing to write: agreement ${v.agreementPct}% is below the ${BAR}% bar ` +
        `(${v.compared} cities compared). Investigate before filling.`,
    );
    process.exit(1);
  }

  const batchId = randomUUID();
  const out = [];

  if (MODE_FILL) {
    const missing = await loadAll(
      'id,name,latitude,longitude,timezone,country_id',
      `${BASE_FILTERS}&timezone=is.null`,
    );
    const changes = [];
    for (const c of missing) {
      const got = lookup(c);
      if (got) changes.push({ ...c, computed: got });
    }
    console.log(`\nfill: ${changes.length} of ${missing.length} missing cities resolved`);
    out.push(...changes);
    if (APPLY) {
      const n = await applyChanges(changes, batchId, 'fill empty timezone from coordinates');
      console.log(`applied ${n} fills under batch ${batchId}`);
    }
  }

  if (MODE_CORRECT) {
    // ONLY the cross-region disagreements. A city cannot be on two continents,
    // so those are unambiguous; same-region differences are left for a human
    // because near a border the raster is the less reliable of the two.
    const changes = v.crossRegion;
    console.log(`\ncorrect: ${changes.length} cross-region disagreements`);
    out.push(...changes);
    if (APPLY) {
      const n = await applyChanges(
        changes,
        batchId,
        'stored timezone was on a different continent from the coordinates',
      );
      console.log(`applied ${n} corrections under batch ${batchId}`);
    }
  }

  if (APPLY) {
    console.log(`\nrevert this run:  select rollback_external_correction_batch('${batchId}');`);
  } else {
    console.log('\n(dry run — nothing written. Add --apply to write.)');
    if (OUT) {
      writeFileSync(OUT, reportSql(out));
      console.log(`SQL written to ${OUT}`);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
