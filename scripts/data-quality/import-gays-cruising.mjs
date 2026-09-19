#!/usr/bin/env node
/**
 * Import gays-cruising.com cruising zones into `venues` via ingestion_staging.
 *
 * ── PROVENANCE: THIS IS OUR OWN CRAWL, NOT A SUPPLIED EXPORT ────────────────
 * The input is NOT a dataset handed over by the rightsholder. On 2026-09-18/19
 * this machine ran `enrichment_server.mjs`, a local server driving a browser
 * that issued **58,618 JSONP calls** to
 *   https://www.gays-cruising.com/api/?op=obtenerZonaInfoWidget&id=<n>&idioma=en
 * at concurrency 16, over spot ids harvested from three approved-spot sitemaps.
 * `enrich_workbook.mjs` folded the results into gays_cruising_all_spots.xlsx.
 *
 * Say "crawled by us under consent ref X", never "supplied by Keyup Studio".
 * The one artifact whose entire job is provenance must not misstate it. This is
 * why `metadata.source_terms` below reads the way it does.
 *
 * ── LICENCE ────────────────────────────────────────────────────────────────
 * gays-cruising.com is operated by Keyup Studio S.L. (Valencia). Condiciones de
 * Uso §5 forbids reproducing or exploiting any part of the service without
 * consent "expreso y por escrito"; §12 repeats it for contents; §17 Spanish law.
 * The consent relied on is recorded in docs/licences/gays-cruising-consent.md
 * and its ref must be present in GAYS_CRUISING_CONSENT_REF or this script exits.
 *
 * ── INPUT ──────────────────────────────────────────────────────────────────
 * out-gays-cruising/enriched_spots.jsonl  (gitignored; 23 MB, 58,658 lines)
 *   sha256 58feeb82486166ea538b8644debab888013b0af9ac3c00e00230951472325090
 * One JSON object per line: {id,title,description,latitude,longitude,locality,
 * region,country,url} or {id,error}. 58,578 usable, 80 errors (ids the API no
 * longer serves).
 *
 * Measured over that file, 2026-09-19:
 *   lat+lng present ......... 58,578 / 58,578  (100%)
 *   locality ................ 100%
 *   region .................. 100%   <- the page parser cannot get this at all
 *   country (as a NAME) ..... 100%, 129 distinct
 *   duplicate source ids .... 0
 *   distinct coord points ... 58,513  (only 122 rows share a point)
 * That last number is why the documented venue-coordinate rot (2,665 venues on
 * 908 shared points from city-centroid fallback) does NOT describe this cohort.
 *
 * ── WHY A SCRIPT AND NOT THE EDGE FUNCTION ─────────────────────────────────
 * supabase/functions/source-gays-cruising/ exists and stays DISABLED. Re-crawling
 * 58,618 pages through it (HARD_CAP=500, so ~118 invocations) would hit their
 * servers a second time and return WORSE data: no `region`, and country derived
 * from COUNTRY_TOKENS' 40 slug tokens instead of the API's 129 real names.
 * A one-off script is also the repo convention (import-patroc, import-spartacus),
 * and it registers nothing in cron/admin_automations/ingestion_sources, so
 * gaysCruisingLicence.test.ts assertions (d) and (e) stay green untouched.
 *
 * ── IDENTITY (load-bearing) ────────────────────────────────────────────────
 * source_entity_id is the site's own numeric spot id, which the JSONL carries as
 * a first-class field. Both import precedents' headers record why: a Spartacus
 * cohort keyed on `<name-slug>:<city>` duplicated 47% of itself. A row whose id
 * is not a positive integer is DROPPED and counted, never fallback-keyed.
 * Matching the edge function's scheme also means that if the crawler is ever
 * enabled, commit takes its UPDATE branch instead of duplicating all 58k rows.
 *
 * Usage:
 *   node scripts/data-quality/import-gays-cruising.mjs --phase report
 *   node scripts/data-quality/import-gays-cruising.mjs --phase stage --country ES --dry-run
 *   node scripts/data-quality/import-gays-cruising.mjs --phase stage --country ES
 *   node scripts/data-quality/import-gays-cruising.mjs --phase drain --country ES
 */

import { execFileSync } from 'node:child_process';
import { createReadStream, mkdirSync, writeFileSync, existsSync, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const SOURCE_NAME = 'gays-cruising';
const OUT = join(process.cwd(), 'out-gays-cruising');
const INPUT = join(OUT, 'enriched_spots.jsonl');

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);
const PHASE = flag('phase', 'report');
const DRY = has('dry-run');
const REFRESH = has('refresh');
const ONLY_COUNTRY = flag('country') ? String(flag('country')).toUpperCase() : null;
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;

/**
 * Prose is OFF by default and turning it on is a deliberate, visible act.
 *
 * The source's spot write-ups are its USERS' authored text. Keyup Studio can
 * license what Keyup owns; it cannot sublicense thousands of third parties'
 * copyright, and no clause granting that has been read. Separately, measured
 * over this file, 1,826 records (3.1%) name a real retail chain — publishing
 * "the toilets in <named business> are a cruising spot" is an assertion about
 * an uninvolved third party that cannot opt out, which is the concern
 * 20261110100000's own header raises and which safety_gated does not address.
 *
 * Enabling this needs BOTH --include-prose and GAYS_CRUISING_PROSE_ACK set to
 * the acknowledgement string, so it cannot be turned on by a stray flag.
 */
const PROSE_ACK = 'i-accept-republishing-user-authored-texts-and-named-businesses';
const INCLUDE_PROSE = has('include-prose') && process.env.GAYS_CRUISING_PROSE_ACK === PROSE_ACK;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- vocabulary

/**
 * The two country names the live `countries` table does not match on
 * lower(name). Verified against prod 2026-09-19: the other 127 of 129 resolve
 * exactly. Kept as a hand map rather than a fuzzy match because a wrong country
 * is not recoverable once it has been derived into city/state/timezone.
 */
const COUNTRY_NAME_FIXUPS = Object.freeze({
  macedonia: 'MK', // countries.name is "North Macedonia"
  reunion: 'RE', // countries.name is "Réunion" (accented)
});

/**
 * Exact normalised names that are placeholders, not venue names. Matched on the
 * WHOLE normalised string, never as a substring — a substring rule would eat
 * "Parque Ecológico de Foo", which is a real name.
 */
const GENERIC_NAMES = new Set([
  'parque', 'park', 'parc', 'parkplatz', 'parking', 'aparcamiento', 'estacionamento',
  'bosque', 'bosc', 'wald', 'floresta', 'mato', 'matorral', 'descampado',
  'wc', 'banheiro', 'banheiros', 'banos', 'baños', 'aseos', 'toilette', 'toiletten',
  'public toilet', 'public toilets', 'servicios', 'sanitarios',
  'playa', 'praia', 'beach', 'strand', 'plage',
  'rio', 'río', 'lago', 'lake', 'see',
  'cruising', 'zona cruising', 'area de descanso', 'área de descanso', 'rest area',
  'centro comercial', 'shopping', 'mall',
]);

/** A floor, not a ceiling: ~35 international chains. Local businesses are not caught. */
const BRAND_RE =
  /\b(walmart|carrefour|mcdonald|burger king|lidl|aldi|ikea|decathlon|home depot|basic.?fit|planet fitness|smart fit|mercadona|tesco|auchan|kaufland|rewe|edeka|migros|shell|repsol|cepsa|starbucks|subway|kfc|zara|primark|el corte ingl|assai|pao de a|renner|americanas|target|costco|walgreens)/i;

const ENTITIES = {
  '&amp;': '&', '&#039;': "'", '&#39;': "'", '&apos;': "'",
  '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
};
const decodeEntities = (s) =>
  String(s ?? '').replace(/&(?:amp|#0?39|apos|quot|lt|gt|nbsp);/g, (m) => ENTITIES[m] ?? m);

/** Lowercase, strip accents and punctuation, collapse whitespace. */
const normName = (s) =>
  decodeEntities(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------- transport

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql(query, attempt = 1) {
  const MAX_ATTEMPTS = 5;
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
      const body = (await res.text()).slice(0, 400);
      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < MAX_ATTEMPTS) {
        console.warn(`[sql] ${res.status}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
        await sleep(2000 * attempt);
        return sql(query, attempt + 1);
      }
      throw new Error(`mgmt API ${res.status}: ${body}`);
    }
    const j = await res.json();
    return j.result ?? j;
  } catch (e) {
    if (e instanceof Error && !/^mgmt API \d/.test(e.message) && attempt < MAX_ATTEMPTS) {
      console.warn(`[sql] ${e.message}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

// ---------------------------------------------------------------- resolution

/**
 * Resolve the source's country NAMES to ISO-2 against the live table, plus the
 * criminalizing set. Read live rather than hardcoded: `death_penalty_risk()` is
 * the platform's single source of truth and is maintained by the ILGA sync, and
 * CLAUDE.md is explicit that a reconstructed predicate is how this goes wrong.
 */
async function resolveCountries(names) {
  const values = names.map((n) => `(${quote(n)})`).join(',');
  const rows = await sql(`
with src(nm) as (values ${values})
select src.nm,
       c.code,
       ( (c.lgbti_criminalization->>'legal') = 'false'
         or public.death_penalty_risk(c.lgbti_criminalization) <> 'none' ) as criminalizing,
       public.death_penalty_risk(c.lgbti_criminalization) as dp_risk
  from src
  left join public.countries c
    on c.duplicate_of_id is null and lower(c.name) = lower(src.nm);`);

  const map = new Map();
  const meta = new Map();
  const unresolved = [];
  for (const r of rows) {
    const code = r.code ?? COUNTRY_NAME_FIXUPS[normName(r.nm)];
    if (!code) {
      unresolved.push(r.nm);
      continue;
    }
    map.set(r.nm, code);
    meta.set(code, { criminalizing: !!r.criminalizing, dp_risk: r.dp_risk ?? 'unknown' });
  }

  // A fixup code still needs its criminalizing flags, which the join missed.
  const missing = [...map.values()].filter((c) => !meta.has(c));
  if (missing.length) {
    const extra = await sql(`
select code,
       ( (lgbti_criminalization->>'legal') = 'false'
         or public.death_penalty_risk(lgbti_criminalization) <> 'none' ) as criminalizing,
       public.death_penalty_risk(lgbti_criminalization) as dp_risk
  from public.countries
 where duplicate_of_id is null and code in (${missing.map(quote).join(',')});`);
    for (const r of extra) {
      meta.set(r.code, { criminalizing: !!r.criminalizing, dp_risk: r.dp_risk ?? 'unknown' });
    }
  }
  return { map, meta, unresolved };
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------- normalize

/**
 * Must stay shape-compatible with `normalize()` in
 * supabase/functions/source-gays-cruising/index.ts, which is the authoritative
 * definition for this source. Two properties there are non-obvious and are the
 * reason this is a copy rather than an improvisation:
 *
 *  - `country` is OMITTED when unknown, never ''. venues_country_iso2_check
 *    rejects the empty string; a `?? ''` silently killed 907/1851
 *    refuge-restrooms rows and 203/381 osm rows before 20260915131700.
 *
 *  - `address` is synthesised as "<name>, <city>". These are laybys and parks
 *    with no street address, and commit_venue_staging_item falls back to the
 *    venue name. It is also load-bearing for the VALIDATOR: a row here scores
 *    W_NO_CONTACT + W_SHORT_DESCRIPTION = 2 warnings and stays `approved`,
 *    but pipeline-validate flips to needs_review at 3. Drop the address, or
 *    fail to resolve the country, and the whole cohort lands in a human queue.
 */
function normalize(rec, countryCode) {
  const name = decodeEntities(rec.title).trim();
  const city = rec.locality ? decodeEntities(rec.locality).trim() : undefined;
  const state = rec.region ? decodeEntities(rec.region).trim() : undefined;
  const lat = Number(rec.latitude);
  const lng = Number(rec.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  return {
    entityType: 'venue',
    sourceId: String(rec.id),
    sourceName: SOURCE_NAME,
    name,
    category: 'cruising',
    ...(state ? { state } : {}),
    ...(INCLUDE_PROSE && rec.description?.trim()
      ? { description: decodeEntities(rec.description).trim() }
      : {}),
    location: {
      ...(countryCode ? { country: countryCode } : {}),
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      ...(hasCoords ? { lat, lng } : {}),
      // `X, X` when the spot is named after its own town, which is common here
      // (a village's one rest area carries the village name). Renders to users.
      address: city && normName(city) !== normName(name) ? `${name}, ${city}` : name,
    },
    metadata: {
      url: rec.url,
      external_id: String(rec.id),
      attribution: 'Gays-Cruising',
      source_terms:
        'Condiciones de Uso §5 — crawled by queer.guide under written consent, ref ' +
        (process.env.GAYS_CRUISING_CONSENT_REF ?? 'UNSET'),
    },
  };
}

// ---------------------------------------------------------------- read + filter

async function readAndFilter(countries) {
  const stats = {
    lines: 0, error_rows: 0, bad_id: 0, unresolved_country: 0,
    generic_name: 0, short_title: 0, no_coords: 0, brand_quarantined: 0, kept: 0,
  };
  const byCountry = {};
  const criminalizing = {};
  const dropped = {};
  const brands = [];
  const kept = [];
  const seenIds = new Set();

  const push = (reason, rec) => (dropped[reason] ??= []).push(rec);

  const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    stats.lines++;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      stats.error_rows++;
      continue;
    }
    if (rec.error) {
      stats.error_rows++;
      continue;
    }

    // Identity first — see the header. A non-integer id is unusable, not fixable.
    if (!Number.isInteger(rec.id) || rec.id <= 0) {
      stats.bad_id++;
      push('bad_id', rec);
      continue;
    }
    if (seenIds.has(rec.id)) continue;
    seenIds.add(rec.id);

    const code = countries.map.get(rec.country);
    if (!code) {
      stats.unresolved_country++;
      push('unresolved_country', rec);
      continue;
    }

    const title = decodeEntities(rec.title ?? '').trim();
    const key = normName(title);
    if (key.length < 3) {
      stats.short_title++;
      push('short_title', rec);
      continue;
    }
    if (GENERIC_NAMES.has(key)) {
      stats.generic_name++;
      push('generic_name', rec);
      continue;
    }

    const lat = Number(rec.latitude);
    const lng = Number(rec.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      stats.no_coords++;
      push('no_coords', rec);
      continue;
    }

    // Quarantined, not dropped: whether to publish an assertion about a named
    // third-party business is an editorial decision, not a script's to make.
    if (BRAND_RE.test(`${title} ${rec.description ?? ''}`)) {
      stats.brand_quarantined++;
      brands.push(rec);
      continue;
    }

    byCountry[code] = (byCountry[code] ?? 0) + 1;
    if (countries.meta.get(code)?.criminalizing) {
      criminalizing[code] = {
        n: (criminalizing[code]?.n ?? 0) + 1,
        dp_risk: countries.meta.get(code).dp_risk,
      };
    }
    stats.kept++;
    kept.push({ rec, code });
  }

  return { stats, byCountry, criminalizing, dropped, brands, kept };
}

// ---------------------------------------------------------------- phases

async function phaseReport() {
  mkdirSync(OUT, { recursive: true });
  const names = await distinctCountryNames();
  console.log(`[report] ${names.length} distinct country names in the file`);
  const countries = await resolveCountries(names);
  if (countries.unresolved.length) {
    console.warn(`[report] UNRESOLVED countries (rows dropped): ${countries.unresolved.join(', ')}`);
  }

  const r = await readAndFilter(countries);

  for (const [reason, rows] of Object.entries(r.dropped)) {
    const p = join(OUT, `dropped-${reason}.ndjson`);
    writeFileSync(p, rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
    console.log(`[report] ${reason}: ${rows.length} -> ${p}`);
  }
  if (r.brands.length) {
    const p = join(OUT, 'quarantine-brands.ndjson');
    writeFileSync(p, r.brands.map((x) => JSON.stringify(x)).join('\n') + '\n');
    console.log(`[report] brand-named (quarantined, NOT staged): ${r.brands.length} -> ${p}`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    input: INPUT,
    include_prose: INCLUDE_PROSE,
    consent_ref: process.env.GAYS_CRUISING_CONSENT_REF ?? null,
    stats: r.stats,
    unresolved_country_names: countries.unresolved,
    by_country: Object.fromEntries(Object.entries(r.byCountry).sort((a, b) => b[1] - a[1])),
    criminalizing_countries_kept: r.criminalizing,
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  console.log('\n[report] ' + JSON.stringify(r.stats));
  console.log(`[report] criminalizing countries KEPT: ${Object.keys(r.criminalizing).length}`);
  console.log(`[report] -> ${join(OUT, 'report.json')}`);
  if (!INCLUDE_PROSE) {
    console.log('[report] prose is EXCLUDED (default). See the header to enable.');
  }
}

async function distinctCountryNames() {
  const set = new Set();
  const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (!o.error && o.country) set.add(o.country);
    } catch {
      /* counted in readAndFilter */
    }
  }
  return [...set].sort();
}

async function phaseStage() {
  // The write path. `--phase report` deliberately does NOT require the ref —
  // reading a local file and printing a tally relies on no permission — but
  // anything that puts this data into the database does.
  requireConsent();

  const names = await distinctCountryNames();
  const countries = await resolveCountries(names);
  const r = await readAndFilter(countries);

  let rows = r.kept;
  if (ONLY_COUNTRY) rows = rows.filter((x) => x.code === ONLY_COUNTRY);
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT);
  const payload = rows.map(({ rec, code }) => normalize(rec, code));

  console.log(
    `[stage] ${payload.length} rows` +
      (ONLY_COUNTRY ? ` for ${ONLY_COUNTRY}` : '') +
      ` | prose=${INCLUDE_PROSE}`,
  );

  if (DRY) {
    console.log(JSON.stringify(payload.slice(0, 3), null, 2));
    console.log(`[stage] dry run — nothing written`);
    return;
  }

  const CHUNK = 100;
  let done = 0;
  let refreshed = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const json = JSON.stringify(chunk);
    if (json.includes('$J$')) throw new Error(`chunk ${i} contains the dollar-quote tag $J$`);

    await sql(`
insert into public.ingestion_staging
  (raw_data, normalized_data, target_table, entity_type, source_type, source_name,
   source_entity_id, payload_hash,
   ai_validation_status, dedup_status, enrichment_status, review_status, disposition)
select
  jsonb_build_object('source','${SOURCE_NAME}','url', n->'metadata'->>'url'),
  n, 'venues', 'venue', '${SOURCE_NAME}', '${SOURCE_NAME}',
  n->>'sourceId',
  encode(extensions.digest(n::text,'sha256'),'hex'),
  'pending','pending','pending','auto','pending'
from jsonb_array_elements($J$${json}$J$::jsonb) as n
on conflict do nothing;`);

    if (REFRESH) {
      // Re-opening a row means restoring EVERY field the stages select on, not
      // just the payload: pipeline-validate filters .eq('entity_type','venue'),
      // so a row with a null entity_type sits at 'pending' forever.
      const res = await sql(`
update public.ingestion_staging s
set normalized_data = n,
    raw_data = jsonb_build_object('source','${SOURCE_NAME}','url', n->'metadata'->>'url'),
    payload_hash = encode(extensions.digest(n::text,'sha256'),'hex'),
    entity_type = 'venue',
    target_table = 'venues',
    disposition = 'pending',
    ai_validation_status = 'pending',
    dedup_status = 'pending',
    enrichment_status = 'pending',
    review_status = 'auto',
    error_message = null,
    processed_at = null,
    updated_at = now()
from jsonb_array_elements($J$${json}$J$::jsonb) as n
where s.source_name = '${SOURCE_NAME}'
  and s.source_entity_id = n->>'sourceId'
  and s.target_table = 'venues'
  and s.payload_hash is distinct from encode(extensions.digest(n::text,'sha256'),'hex')
returning 1;`);
      refreshed += (res ?? []).length;
    }

    done += chunk.length;
    if (done % 1000 === 0 || done === payload.length) {
      console.log(`[stage] ${done}/${payload.length}${REFRESH ? ` (refreshed ${refreshed})` : ''}`);
    }
  }
  console.log('[stage] done');
}

function requireConsent() {
  if (!process.env.GAYS_CRUISING_CONSENT_REF) {
    console.error(
      'GAYS_CRUISING_CONSENT_REF is unset.\n' +
        'Condiciones de Uso §5 requires consent "expreso y por escrito". The ref points\n' +
        'at the record in docs/licences/gays-cruising-consent.md so that "who said we\n' +
        'could?" has an answer in the config rather than in somebody\'s memory.',
    );
    process.exit(2);
  }
}

// ---------------------------------------------------------------- drain

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

/**
 * Serialised on purpose — the stage functions have no FOR UPDATE SKIP LOCKED,
 * so concurrent invocations grab the same rows (measured on Spartacus).
 * Fired through pg_net so the internal-invoke secret is read from the vault
 * inside the database and never leaves it.
 */
async function firePipelineStage(fn, batchSize) {
  await sql(`
select net.http_post(
  url := 'https://${PROJECT}.supabase.co/functions/v1/${fn}',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ${ANON_KEY}',
    'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
  ),
  body := '{"entityType":"venue","batch_size":${batchSize}}'::jsonb,
  timeout_milliseconds := 150000
);`);
}

async function countActionable(predicate) {
  const res = await sql(`
select count(*)::int as n from public.ingestion_staging
where source_name='${SOURCE_NAME}' and target_table='venues'
  and disposition = 'pending' and ${predicate};`);
  return Number(res[0].n);
}

async function drainStage(label, fn, predicate, batchSize) {
  let stallRounds = 0;
  let prev = await countActionable(predicate);
  console.log(`[drain] ${label}: ${prev} pending`);

  while (prev > 0) {
    await firePipelineStage(fn, batchSize);
    await sleep(35_000);
    const now = await countActionable(predicate);
    if (now >= prev) {
      // Not a retry loop: two rounds of no progress means something upstream is
      // wrong, and hammering it makes the diagnosis harder, not the drain faster.
      if (++stallRounds >= 2) {
        console.warn(`[drain] ${label}: STALLED at ${now} — stopping, inspect manually`);
        return false;
      }
    } else {
      stallRounds = 0;
    }
    prev = now;
    console.log(`[drain] ${label}: ${now} pending`);
  }
  return true;
}

async function phaseDrain() {
  requireConsent();

  if (!(await drainStage('validate', 'pipeline-validate', "ai_validation_status = 'pending'", 500)))
    return;

  // Deliberate checkpoint. A cohort this shaped should come out almost entirely
  // `approved` (2 warnings: W_NO_CONTACT + W_SHORT_DESCRIPTION, against a
  // needs_review threshold of 3). A large needs_review count means a THIRD
  // warning is firing — most likely a missing address or an unresolved country
  // — and thousands of rows are about to land in a human queue. Stop and look.
  const v = await sql(`
select ai_validation_status, count(*)::int as n from public.ingestion_staging
where source_name='${SOURCE_NAME}' and target_table='venues'
group by 1 order by 2 desc;`);
  console.log('[drain] validation:', JSON.stringify(v));
  const needsReview = Number(v.find((r) => r.ai_validation_status === 'needs_review')?.n ?? 0);
  const total = v.reduce((a, r) => a + Number(r.n), 0);
  if (total && needsReview / total > 0.05) {
    console.warn(
      `[drain] ${needsReview}/${total} rows are needs_review (>5%). Stopping before dedup —\n` +
        `        diagnose the third warning first; see the comment above this check.`,
    );
    return;
  }

  if (
    !(await drainStage(
      'dedup',
      'pipeline-deduplicate',
      "ai_validation_status = 'approved' and dedup_status = 'pending'",
      500,
    ))
  )
    return;

  // This number decides whether the full corpus is viable. A few hundred
  // merge_candidates is workable; a few thousand is a rubber-stamp factory and
  // means tightening GENERIC_NAMES before scaling past this cohort.
  const d = await sql(`
select dedup_status, count(*)::int as n from public.ingestion_staging
where source_name='${SOURCE_NAME}' and target_table='venues'
group by 1 order by 2 desc;`);
  console.log('[drain] dedup:', JSON.stringify(d));

  let committed = 0;
  for (;;) {
    const res = await sql(`select count(*)::int as n from public.commit_venue_staging_batch(200);`);
    const n = Number(res[0].n);
    if (!n) break;
    committed += n;
    console.log(`[drain] committed ${committed}`);
  }
  console.log(`[drain] done — ${committed} committed this pass`);

  // The gate is the only thing standing behind the decision to import
  // criminalizing countries, so it is verified every run, not once at the end.
  const g = await sql(`
select count(*) filter (where not v.safety_gated)        as ungated,
       count(*) filter (where v.category <> 'cruising')  as miscategorised,
       count(*)                                          as total
  from public.venues v
  join public.venue_sources vs on vs.venue_id = v.id
 where vs.source_slug = '${SOURCE_NAME}';`);
  console.log('[drain] gate check:', JSON.stringify(g[0]));

  // `ungated:0, miscategorised:0` is ALSO what an empty result set returns, so
  // the count is reported first and a zero-row corpus after a non-zero commit
  // is a FAILURE, not a pass. Measured while writing this: against an empty
  // table the check read "0 ungated" and would have printed success having
  // verified nothing.
  const gTotal = Number(g[0].total);
  if (committed > 0 && gTotal === 0) {
    console.error(
      `[drain] PROBE BROKEN — committed ${committed} rows but venue_sources has 0 for` +
        ` source_slug='${SOURCE_NAME}'. The gate was NOT verified. Do not read this as clean.`,
    );
    process.exitCode = 1;
  } else if (Number(g[0].ungated) > 0 || Number(g[0].miscategorised) > 0) {
    console.error('[drain] GATE FAILED — rows are ungated or miscategorised. Investigate now.');
    process.exitCode = 1;
  } else if (gTotal > 0) {
    console.log(`[drain] gate verified on ${gTotal} rows`);
  }
}

// ---------------------------------------------------------------- main

const PHASES = { report: phaseReport, stage: phaseStage, drain: phaseDrain };

if (!existsSync(INPUT)) {
  console.error(`missing input: ${INPUT}\nSee the header — copy it out of the crawl directory.`);
  process.exit(2);
}
const fn = PHASES[PHASE];
if (!fn) {
  console.error(`unknown --phase ${PHASE}; expected one of ${Object.keys(PHASES).join('|')}`);
  process.exit(2);
}
await fn();
