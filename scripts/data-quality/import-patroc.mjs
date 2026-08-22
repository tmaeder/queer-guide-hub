#!/usr/bin/env node
/**
 * Import patroc.com venues ("locations") and events into ingestion_staging.
 *
 * Patroc is a curated gay travel guide for ~38 European cities. Per city we
 * fetch the index page (its "Upcoming Events" hCalendar section) and every
 * category listing page the city menu links (bars, clubs, saunas, cruising,
 * hotels, …). The aggregate gayguide.html is deliberately NOT used: it strips
 * the `vevent` class that distinguishes a recurring party (Gayhane) from a
 * venue (Berghain), which is exactly how the 2026-04 import filed
 * "Ibiza Gay Pride 2026" as a bar. Parsers + tests live in
 * supabase/functions/_shared/patroc-parse.ts.
 *
 * IDENTITY: source_entity_id is the BARE NUMERIC patroc id that every block
 * carries (`div.item id="4440"`, `id="event5612"`, `id="news5612"` — one id
 * space; the event/news prefixes are page styling). The three earlier patroc
 * cohorts all used name-derived keys (`patroc-sub`,
 * `patroc-berlin-<slug>-n1`), which is the same unstable scheme that
 * duplicated 47% of the Spartacus 2026-04-26 cohort. New rows key on the
 * numeric id; the dedup stage links name+city matches back to the venues those
 * old keys created, so commit takes the UPDATE branch on them.
 *
 * robots.txt asks for Crawl-delay: 10 — respected between every fetch, so a
 * full crawl (~420 requests) takes ~70 minutes and is disk-cached; re-runs
 * cost nothing.
 *
 * Usage:
 *   node scripts/data-quality/import-patroc.mjs --phase crawl [--city berlin,sitges]
 *   node scripts/data-quality/import-patroc.mjs --phase stage [--dry-run] [--refresh]
 *   node scripts/data-quality/import-patroc.mjs --phase drain
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Node ≥22.18 strips erasable TS syntax natively, so the Deno-first parser
// module loads as-is (its ./spartacus-parse.ts import resolves the same way).
const parse = await import('../../supabase/functions/_shared/patroc-parse.ts');

const PROJECT = 'xqeacpakadqfxjxjcewc';
const BASE = 'https://www.patroc.com';
const OUT = join(process.cwd(), 'out-patroc');
const CACHE = join(OUT, 'cache');

// robots.txt: `User-agent: * / Crawl-delay: 10`
const DELAY_MS = 10_000;
const RETRIES = 3;

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);
const PHASE = flag('phase', 'crawl');
const DRY = has('dry-run');
const REFRESH = has('refresh');
const ONLY = flag('city')
  ? String(flag('city')).split(',').map((s) => s.trim().toLowerCase())
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fetching

function cachePath(key) {
  const safe = key.replace(/[^a-z0-9._-]/gi, '_').slice(0, 180);
  return join(CACHE, `${safe}.html`);
}

async function getCached(key, url) {
  const p = cachePath(key);
  if (existsSync(p)) return readFileSync(p, 'utf8');

  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'QueerGuideBot/1.0 (+https://queer.guide; venue directory sync)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(45_000),
      });
      // A category the menu links but the city lacks 404s — that is an answer,
      // not an error; cache a tombstone so re-runs skip it.
      if (res.status === 404) {
        writeFileSync(p, '<!-- 404 -->');
        await sleep(DELAY_MS);
        return '<!-- 404 -->';
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (html.length < 500) throw new Error(`suspiciously short body (${html.length}B)`);
      writeFileSync(p, html);
      await sleep(DELAY_MS);
      return html;
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await sleep(DELAY_MS * attempt);
    }
  }
  throw new Error(`${key}: ${lastErr.message}`);
}

// ---------------------------------------------------------------- crawl

/** Fallback venue city per guide slug, used only when a block's own adr lacks
 * the city line. grancanaria is the one where the guide name is NOT the city —
 * its venues sit in Maspalomas / Playa del Inglés. */
const CITY_DISPLAY = {
  grancanaria: 'Maspalomas',
};
const displayCity = (slug) =>
  CITY_DISPLAY[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);

async function phaseCrawl() {
  mkdirSync(CACHE, { recursive: true });
  const cities = Object.keys(parse.PATROC_CITIES).filter(
    (c) => !ONLY || ONLY.includes(c),
  );

  const venuesById = new Map();
  const eventsById = new Map();
  let pagesFetched = 0;
  const failures = [];

  for (const city of cities) {
    let indexHtml;
    try {
      indexHtml = await getCached(`${city}__index`, `${BASE}/gay/${city}/`);
      pagesFetched++;
    } catch (e) {
      failures.push(`${city}/index: ${e.message}`);
      continue;
    }

    const addEvent = (ev) => {
      const prev = eventsById.get(ev.id);
      if (!prev) {
        eventsById.set(ev.id, { ...ev, city_slug: city });
        return;
      }
      // Category-page copies carry the adr block (street + postal); index
      // copies carry the loose-text times. Merge, category copy wins fields.
      for (const k of Object.keys(ev)) {
        if (prev[k] == null || prev[k] === '' || (Array.isArray(prev[k]) && !prev[k].length)) {
          if (ev[k] != null) prev[k] = ev[k];
        }
      }
    };

    for (const ev of parse.parseCityIndexEvents(indexHtml)) addEvent(ev);

    const pages = parse.parseCategoryPages(indexHtml);
    for (const page of pages) {
      let html;
      try {
        html = await getCached(`${city}__${page}`, `${BASE}/gay/${city}/${page}.html`);
        pagesFetched++;
      } catch (e) {
        failures.push(`${city}/${page}: ${e.message}`);
        continue;
      }
      if (html.startsWith('<!-- 404 -->')) continue;
      const { venues, events } = parse.parseListingPage(html, page);
      for (const v of venues) {
        const rec = { ...v, city_slug: city, category: parse.mapPageCategory(page) };
        const prev = venuesById.get(v.id);
        // A venue can be cross-listed (cafe that is also a bar). Keep the
        // first non-'other' category reading; merge missing fields.
        if (!prev) venuesById.set(v.id, rec);
        else {
          if (prev.category === 'other' && rec.category !== 'other') {
            venuesById.set(v.id, { ...rec, ...withoutNulls(prev), category: rec.category });
          } else {
            for (const k of Object.keys(rec)) if (prev[k] == null && rec[k] != null) prev[k] = rec[k];
          }
        }
      }
      for (const ev of events) addEvent(ev);
    }
    console.log(
      `[crawl] ${city}: pages=${pages.length + 1} venues so far=${venuesById.size} events so far=${eventsById.size}`,
    );
  }

  const venues = [...venuesById.values()];
  const events = [...eventsById.values()];
  writeFileSync(join(OUT, 'venues.ndjson'), venues.map((r) => JSON.stringify(r)).join('\n'));
  writeFileSync(join(OUT, 'events.ndjson'), events.map((r) => JSON.stringify(r)).join('\n'));
  console.log(`\n[crawl] ${pagesFetched} pages -> ${venues.length} venues, ${events.length} events`);
  console.log('[crawl] venue categories:', tally(venues, (v) => v.category));
  console.log('[crawl] events with date:', events.filter((e) => e.startDate).length);
  if (failures.length) console.warn('[crawl] failures:\n  ' + failures.join('\n  '));
}

function withoutNulls(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
}

function tally(rows, fn) {
  const t = {};
  for (const r of rows) t[fn(r)] = (t[fn(r)] || 0) + 1;
  return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]));
}

function readNdjson(p) {
  if (!existsSync(p)) throw new Error(`missing ${p} — run --phase crawl first`);
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------- stage

function venueToNormalized(rec) {
  const cityInfo = parse.PATROC_CITIES[rec.city_slug];
  const { city, postal } = parse.splitCityLine(rec.cityLine);
  const website = rec.websites?.[0];
  return {
    entityType: 'venue',
    sourceId: rec.id,
    sourceName: 'patroc',
    name: rec.name,
    description: rec.description || undefined,
    category: rec.category,
    location: {
      address: rec.street || undefined,
      city: city || displayCity(rec.city_slug),
      postal_code: postal || undefined,
      // MUST be ISO-2 — venues_country_iso2_check; commit writes it verbatim.
      country: cityInfo.country,
      lat: Number.isFinite(rec.lat) ? rec.lat : undefined,
      lng: Number.isFinite(rec.lng) ? rec.lng : undefined,
    },
    contacts: {
      phone: rec.phone || undefined,
      website: website || undefined,
    },
    tags: ['queer-friendly'],
    metadata: {
      data_source: 'patroc',
      url: `${BASE}/gay/${rec.city_slug}/${rec.slug ? `d/${rec.slug}.html` : ''}`,
      id: rec.id,
      city_slug: rec.city_slug,
      page: rec.page,
      section: rec.section || null,
      hours_text: rec.hoursText || null,
      transport: rec.transport || null,
      // Real Google Place id per venue — a future platform_ids.google backfill
      // can read these out of venue_sources.payload without re-crawling.
      google_place_id: rec.googlePlaceId || null,
      websites: rec.websites || [],
    },
  };
}

function eventToNormalized(rec) {
  const cityInfo = parse.PATROC_CITIES[rec.city_slug];
  const cityName = displayCity(rec.city_slug);
  const { city, postal } = parse.splitCityLine(rec.cityLine);
  // "@ Berlin" on a city-wide event is a place label, not a venue.
  const venueName =
    rec.venueName && rec.venueName.toLowerCase() !== cityName.toLowerCase()
      ? rec.venueName
      : undefined;

  // Patroc writes after-midnight starts as "24:30" (half past midnight the
  // NEXT day) — a raw `T24:30:00` is an invalid timestamp and got four real
  // parties rejected with E_INVALID_START_DATE. Roll hours ≥24 into the next
  // calendar day.
  const composeTs = (date, time) => {
    if (!time) return date;
    let [h, m] = time.split(':').map(Number);
    const d = new Date(`${date}T00:00:00Z`);
    if (h >= 24) {
      d.setUTCDate(d.getUTCDate() + Math.floor(h / 24));
      h = h % 24;
    }
    return `${d.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  };

  const start = composeTs(rec.startDate, rec.startTime);
  let end;
  if (rec.endDate) {
    end = composeTs(rec.endDate, rec.endTime);
  } else if (rec.endTime && rec.startTime) {
    // Overnight party: 20:00 – 10:00 with a single dtstart date.
    const overnight = rec.endTime < rec.startTime;
    const d = new Date(`${rec.startDate}T00:00:00Z`);
    if (overnight) d.setUTCDate(d.getUTCDate() + 1);
    end = composeTs(d.toISOString().slice(0, 10), rec.endTime);
  }

  return {
    entityType: 'event',
    sourceId: rec.id,
    sourceName: 'patroc',
    title: rec.title,
    description: rec.description || undefined,
    event_type: parse.inferEventType(rec.title, rec.description),
    start_date: start,
    end_date: end || undefined,
    venue_name: venueName,
    website: rec.websites?.[0] || undefined,
    location: {
      address: rec.street || undefined,
      city: city || cityName,
      postal_code: postal || undefined,
      country: cityInfo.country,
      lat: Number.isFinite(rec.lat) ? rec.lat : undefined,
      lng: Number.isFinite(rec.lng) ? rec.lng : undefined,
      timezone: cityInfo.timezone,
    },
    tags: ['queer-friendly'],
    metadata: {
      data_source: 'patroc',
      url: `${BASE}/gay/${rec.city_slug}/${rec.slug ? `d/${rec.slug}.html` : ''}`,
      id: rec.id,
      city_slug: rec.city_slug,
      recurring: !!rec.recurring,
      hours_text: rec.hoursText || null,
      google_place_id: rec.googlePlaceId || null,
      websites: rec.websites || [],
    },
  };
}

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
    return res.json();
  } catch (e) {
    if (e instanceof Error && !/^mgmt API \d/.test(e.message) && attempt < MAX_ATTEMPTS) {
      console.warn(`[sql] ${e.message}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

async function stageRows(rows, targetTable, entityType) {
  const CHUNK = 100;
  let done = 0;
  let refreshed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const payload = JSON.stringify(chunk);
    if (payload.includes('$J$')) throw new Error(`chunk ${i} contains the dollar-quote tag $J$`);
    await sql(`
insert into public.ingestion_staging
  (raw_data, normalized_data, target_table, entity_type, source_type, source_name,
   source_entity_id, payload_hash,
   ai_validation_status, dedup_status, enrichment_status, review_status, disposition)
select
  jsonb_build_object('source','patroc','url', n->'metadata'->>'url'),
  n, '${targetTable}', '${entityType}', 'patroc', 'patroc',
  n->>'sourceId',
  encode(extensions.digest(n::text,'sha256'),'hex'),
  'pending','pending','pending','auto','pending'
from jsonb_array_elements($J$${payload}$J$::jsonb) as n
where not exists (
  -- The three legacy patroc cohorts key on name-slugs, so the idempotency
  -- trigger cannot see them; without this guard every legacy row would be
  -- restaged as a brand-new record under its numeric id while an OPEN legacy
  -- staging row for the same thing still sits in the queue.
  select 1 from public.ingestion_staging s0
  where s0.source_name='patroc' and s0.source_entity_id = n->>'sourceId'
)
on conflict do nothing;`);

    if (REFRESH) {
      const r = await sql(`
update public.ingestion_staging s
set normalized_data = n,
    raw_data = jsonb_build_object('source','patroc','url', n->'metadata'->>'url'),
    payload_hash = encode(extensions.digest(n::text,'sha256'),'hex'),
    entity_type = '${entityType}',
    target_table = '${targetTable}',
    disposition = 'pending',
    ai_validation_status = 'pending',
    dedup_status = 'pending',
    enrichment_status = 'pending',
    review_status = 'auto',
    error_message = null,
    processed_at = null,
    updated_at = now()
from jsonb_array_elements($J$${payload}$J$::jsonb) as n
where s.source_name = 'patroc'
  and s.source_entity_id = n->>'sourceId'
  and s.target_table = '${targetTable}'
  and s.payload_hash is distinct from encode(extensions.digest(n::text,'sha256'),'hex')
returning 1;`);
      refreshed += (r.result ?? r ?? []).length;
    }

    done += chunk.length;
    console.log(`[stage] ${targetTable} ${done}/${rows.length}${REFRESH ? ` (refreshed ${refreshed})` : ''}`);
  }
}

async function phaseStage() {
  const eventsRaw = readNdjson(join(OUT, 'events.ndjson'));
  // A record can be dual-listed: a venue-shaped block on one page and a dated
  // vevent on another (Oktoberfest, Queer Lisboa, Bear Necessity…). A real
  // venue is never also a dated vevent, so on id collision the EVENT reading
  // wins and the venue reading is dropped — the reverse of keeping both,
  // which would re-create the events-filed-as-bars junk this importer exists
  // to avoid.
  const eventIds = new Set(eventsRaw.map((r) => r.id));
  const venues = readNdjson(join(OUT, 'venues.ndjson'))
    .filter((r) => r.name && r.name.trim() && !eventIds.has(r.id))
    .map(venueToNormalized);
  const dateless = eventsRaw.filter((r) => !r.startDate);
  const events = eventsRaw
    .filter((r) => r.title && r.startDate)
    .map(eventToNormalized);

  console.log(`[stage] ${venues.length} venues, ${events.length} events (${dateless.length} dateless events skipped)`);
  console.log('[stage] venue categories:', tally(venues, (r) => r.category));
  console.log('[stage] event types:', tally(events, (r) => r.event_type));
  console.log('[stage] venues with coords:', venues.filter((r) => r.location.lat != null).length);
  console.log('[stage] events with venue_name:', events.filter((r) => r.venue_name).length);

  if (DRY) {
    writeFileSync(
      join(OUT, 'staged-preview.json'),
      JSON.stringify({ venues: venues.slice(0, 3), events: events.slice(0, 3) }, null, 2),
    );
    console.log(`[stage] DRY RUN — sample written to ${join(OUT, 'staged-preview.json')}`);
    return;
  }

  await stageRows(venues, 'venues', 'venue');
  await stageRows(events, 'events', 'event');
  console.log('[stage] done');
}

// ---------------------------------------------------------------- drain

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

/** Serialised on purpose — the stage functions have no FOR UPDATE SKIP LOCKED,
 * so concurrent invocations grab the same rows (measured on Spartacus). */
async function firePipelineStage(fn, entityType, batchSize) {
  await sql(`
select net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/${fn}',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ${ANON_KEY}',
    'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
  ),
  body := '{"entityType":"${entityType}","batch_size":${batchSize}}'::jsonb,
  timeout_milliseconds := 150000
);`);
}

async function countActionable(targetTable, predicate) {
  const res = await sql(`
select count(*)::int as n from public.ingestion_staging
where source_name='patroc' and target_table='${targetTable}'
  and disposition = 'pending' and ${predicate};`);
  return Number((res.result ?? res)[0].n);
}

async function drainStage(label, fn, targetTable, entityType, predicate, batchSize) {
  let stallRounds = 0;
  let prev = await countActionable(targetTable, predicate);
  console.log(`[drain] ${label}: ${prev} pending`);

  while (prev > 0) {
    await firePipelineStage(fn, entityType, batchSize);
    await sleep(35_000);
    const now = await countActionable(targetTable, predicate);
    if (now >= prev) {
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

async function drainFamily(targetTable, entityType, commitFn) {
  const okValidate = await drainStage(
    `${entityType} validate`,
    'pipeline-validate',
    targetTable,
    entityType,
    "ai_validation_status = 'pending'",
    500,
  );
  if (!okValidate) return;
  const okDedup = await drainStage(
    `${entityType} dedup`,
    'pipeline-deduplicate',
    targetTable,
    entityType,
    "ai_validation_status = 'approved' and dedup_status = 'pending'",
    500,
  );
  if (!okDedup) return;

  let total = 0;
  for (;;) {
    const res = await sql(`select count(*)::int as n from public.${commitFn}(200);`);
    const n = Number((res.result ?? res)[0].n);
    if (!n) break;
    total += n;
    console.log(`[drain] ${entityType} committed ${total}`);
  }
  console.log(`[drain] ${entityType} done — ${total} committed this pass`);
}

async function phaseDrain() {
  await drainFamily('venues', 'venue', 'commit_venue_staging_batch');
  await drainFamily('events', 'event', 'commit_event_staging_batch');
}

// ---------------------------------------------------------------- main

const PHASES = { crawl: phaseCrawl, stage: phaseStage, drain: phaseDrain };
if (!PHASES[PHASE]) {
  console.error(`unknown --phase ${PHASE}; expected one of ${Object.keys(PHASES).join(', ')}`);
  process.exit(1);
}
await PHASES[PHASE]();
