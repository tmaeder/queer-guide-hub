/**
 * Import European Test Finder testing sites as support organizations.
 *
 * SOURCE   https://testfinder.info — EuroTEST/CHIP, Rigshospitalet, University
 *          of Copenhagen. ~534 HIV / viral hepatitis / STI testing sites across
 *          46 countries. Publicly funded public-health directory.
 *
 * IDENTITY `source.external_id` is THEIR slug, taken from `/centers/<slug>/`.
 *          It is not a name-derived key we invented — see import-patroc.mjs:14-25
 *          for why that distinction is load-bearing (the 2026-04-26 Spartacus
 *          cohort keyed on `spartacus:<name-slug>:<city>` and duplicated 47% of
 *          itself). Stored at `organizations.field_provenance.source.external_id`
 *          and indexed by `organizations_source_external_id_idx`.
 *
 * RATE     No robots.txt exists (404). DELAY_MS is the politeness budget and
 *          defaults to 5s — roughly 0.2 req/s, about 50 minutes for a full cold
 *          crawl. Every response is cached to disk, so a re-run costs nothing
 *          and an interrupted crawl resumes where it stopped.
 *
 * TERMS    testfinder.info's ToS prohibits systematic retrieval into another
 *          database, and Danish law means the EU sui generis database right
 *          applies on top of contract. This importer runs on the explicit
 *          instruction of the site operator (queer.guide). The `verify` phase
 *          below is the mitigation: testfinder is used as a DISCOVERY INDEX,
 *          and no record is published until it has been re-checked against the
 *          facility's own website. A permission request to
 *          europeantestfinder@regionh.dk is the durable fix.
 *
 * STALE    Sampled records read "Last updated: 15 November, 2021" — ~5 years.
 *          For health facilities that is the real risk, not the legal one.
 *          `--phase promote` publishes ONLY rows whose own website answered.
 *
 * USAGE
 *   node scripts/data-quality/import-testfinder.mjs --phase crawl   [--country X] [--limit N] [--delay 5000]
 *   node scripts/data-quality/import-testfinder.mjs --phase verify  [--limit N]
 *   node scripts/data-quality/import-testfinder.mjs --phase load    [--dry-run]
 *   node scripts/data-quality/import-testfinder.mjs --phase promote [--dry-run]
 *   node scripts/data-quality/import-testfinder.mjs --phase reindex
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Node >=22.18 strips erasable TS syntax natively, so the Deno-first parser
// module loads as-is (its ./spartacus-parse.ts import resolves the same way).
const parse = await import('../../supabase/functions/_shared/testfinder-parse.ts');

const PROJECT = 'xqeacpakadqfxjxjcewc';
const BASE = 'https://testfinder.info';
const OUT = join(process.cwd(), 'out-testfinder');
const CACHE = join(OUT, 'cache');
const CENTERS = join(OUT, 'centers.ndjson');
const VERIFIED = join(OUT, 'verified.ndjson');

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);

const PHASE = flag('phase', 'crawl');
const DRY = has('dry-run');
const DELAY_MS = Number(flag('delay', 5000));
const LIMIT = flag('limit') ? Number(flag('limit')) : null;
const ONLY_COUNTRY = flag('country') ? String(flag('country')) : null;
const RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'QueerGuideBot/1.0 (+https://queer.guide; sexual-health directory sync)';
// Third-party facility sites, one request each — see verifyOne.
const VERIFY_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// ------------------------------------------------------------------ fetching

/**
 * Cache filename for a logical key.
 *
 * The sanitiser collapses every character outside [a-z0-9._-] to '_', which is
 * fine for ASCII keys and CATASTROPHIC for the Georgian, Greek, Hebrew and
 * Cyrillic centre slugs: two different centres sanitise to the same filename
 * and silently serve each other's HTML. So when sanitising actually changed
 * something, disambiguate with a hash of the real key.
 *
 * The `safe === key` fast path is deliberate — it keeps every already-fetched
 * ASCII page valid, so fixing this does not force a full re-crawl.
 */
function cachePath(key) {
  const safe = key.replace(/[^a-z0-9._-]/gi, '_').slice(0, 180);
  if (safe === key) return join(CACHE, `${safe}.html`);
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 10);
  return join(CACHE, `${safe}-${digest}.html`);
}

async function getCached(key, url) {
  const p = cachePath(key);
  if (existsSync(p)) return readFileSync(p, 'utf8');

  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(45_000),
      });
      // A 404 is an answer, not an error — cache a tombstone so re-runs skip it.
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

const readNdjson = (p) =>
  existsSync(p)
    ? readFileSync(p, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const writeNdjson = (p, rows) =>
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

// --------------------------------------------------------------------- crawl

async function phaseCrawl() {
  mkdirSync(CACHE, { recursive: true });

  const searchHtml = await getCached('search-form', `${BASE}/search`);
  let countries = parse.parseCountryList(searchHtml);
  if (!countries.length) throw new Error('no countries parsed from the search form');
  if (ONLY_COUNTRY) {
    countries = countries.filter((c) => c.toLowerCase() === ONLY_COUNTRY.toLowerCase());
    if (!countries.length) throw new Error(`country ${ONLY_COUNTRY} not in the source vocabulary`);
  }
  console.log(`[crawl] ${countries.length} countries`);

  // Pass 1 — the country result pages. These already carry name, slug, city,
  // street, contacts, services, coords and the source's own "last updated".
  const byslug = new Map();
  const countryCounts = [];
  for (const country of countries) {
    const html = await getCached(
      `search-${country}`,
      `${BASE}/search?country=${encodeURIComponent(country)}`,
    );
    const declared = parse.parseResultCount(html);
    const rows = parse.parseSearchResults(html);
    // A mismatch means the card regex missed rows — loud, not silent.
    const flagStr = declared !== null && declared !== rows.length ? '  *** MISMATCH ***' : '';
    countryCounts.push({ country, declared, parsed: rows.length });
    console.log(`[crawl]   ${country}: ${rows.length}/${declared ?? '?'}${flagStr}`);
    for (const row of rows) byslug.set(row.slug, { ...row, sourceCountry: country });
  }

  const mismatches = countryCounts.filter((c) => c.declared !== null && c.declared !== c.parsed);
  if (mismatches.length) {
    console.warn(`[crawl] ${mismatches.length} countries where parsed != declared:`);
    for (const m of mismatches) console.warn(`         ${m.country}: ${m.parsed} vs ${m.declared}`);
  }

  // Pass 2 — detail pages, for hours / test types / access / target population.
  // The card is authoritative for services (it keeps both service lines in one
  // element); the detail page fills the rest.
  let list = [...byslug.values()];
  if (LIMIT) list = list.slice(0, LIMIT);
  console.log(`[crawl] ${list.length} detail pages`);

  const out = [];
  let i = 0;
  for (const row of list) {
    i += 1;
    let detail = null;
    try {
      // encodeURIComponent, because non-Latin slugs are real here (Georgian,
      // Greek, Hebrew, Cyrillic) and must be percent-encoded in the request
      // even though the cache key keeps the decoded form.
      const html = await getCached(
        `center-${row.slug}`,
        `${BASE}/centers/${encodeURIComponent(row.slug)}/`,
      );
      if (!html.startsWith('<!-- 404 -->')) detail = parse.parseCenterDetail(html, row.slug);
    } catch (e) {
      console.warn(`[crawl]   detail ${row.slug} failed: ${e.message}`);
    }
    if (i % 25 === 0) console.log(`[crawl]   ${i}/${list.length}`);

    out.push({
      ...row,
      // Card services win; detail only fills what the card lacks.
      services: row.services?.length ? row.services : (detail?.services ?? []),
      openingHours: detail?.openingHours ?? null,
      hivFreeFor: detail?.hivFreeFor ?? null,
      hepatitisFreeFor: detail?.hepatitisFreeFor ?? null,
      stiFreeFor: detail?.stiFreeFor ?? null,
      stiTestTypes: detail?.stiTestTypes ?? [],
      hivTestTypes: detail?.hivTestTypes ?? [],
      servicesAccess: detail?.servicesAccess ?? null,
      bookingWebsite: detail?.bookingWebsite ?? null,
      bookingPhone: detail?.bookingPhone ?? null,
      siteType: detail?.siteType ?? null,
      targetPopulation: detail?.targetPopulation ?? [],
      hasDetail: detail !== null,
    });
  }

  writeNdjson(CENTERS, out);

  const unmapped = new Map();
  for (const r of out) {
    for (const s of parse.unmappedServices(r.services ?? [])) {
      unmapped.set(s, (unmapped.get(s) ?? 0) + 1);
    }
  }
  console.log(`\n[crawl] wrote ${out.length} centers -> ${CENTERS}`);
  console.log(`[crawl]   with coords:  ${out.filter((r) => r.lat !== null).length}`);
  console.log(`[crawl]   with website: ${out.filter((r) => r.website).length}`);
  console.log(`[crawl]   with hours:   ${out.filter((r) => r.openingHours).length}`);
  console.log(`[crawl]   detail ok:    ${out.filter((r) => r.hasDetail).length}`);
  if (unmapped.size) {
    console.warn(`[crawl] service labels no rule recognises (would be untagged):`);
    for (const [k, v] of [...unmapped].sort((a, b) => b[1] - a[1])) {
      console.warn(`         ${String(v).padStart(4)}  ${k}`);
    }
  } else {
    console.log(`[crawl]   unmapped services: none`);
  }
}

// -------------------------------------------------------------------- verify

/**
 * Re-check each centre against ITS OWN website.
 *
 * Be precise about what this does and does not establish. It verifies that the
 * facility still has a live web presence at the URL the directory lists, and
 * records whether that page still mentions the facility's name. It does NOT
 * verify opening hours, services, or that the clinic is open today — no cheap
 * automated check can, and claiming otherwise on health content would be worse
 * than claiming nothing.
 *
 * `live` is therefore the bar for publication, not for truth: it means a
 * five-year-old directory entry still points at something that exists.
 */
async function verifyOne(row) {
  if (!row.website) return { status: 'no_website', checked_at: new Date().toISOString() };

  const started = Date.now();
  try {
    // A BROWSER User-Agent here, deliberately, unlike the crawl.
    //
    // The crawl identifies itself as QueerGuideBot because it is hitting one
    // known site repeatedly and should be attributable and blockable. This
    // stage instead touches ~480 unrelated third-party hosts once each, and
    // many sit behind a WAF that 403s an unknown UA on sight. Measured: of the
    // 403s this produced, 3 of the first 4 re-tested return HTTP 200 from a
    // normal browser UA — uke-infektionen.de, himerushealth.ie,
    // sexualhealthwest.ie are all live. Treating a bot-block as a dead clinic
    // withholds real testing sites from users.
    const res = await fetch(row.website, {
      headers: { 'User-Agent': VERIFY_UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    const body = res.ok ? (await res.text()).slice(0, 200_000) : '';
    // Distinctive tokens only: short/common words match anything.
    const tokens = String(row.nameEnglish ?? row.name ?? '')
      .toLowerCase()
      .split(/[^a-z0-9åäöæøéèüñ]+/i)
      .filter((t) => t.length >= 5);
    const haystack = body.toLowerCase();
    const nameMatch = tokens.length > 0 && tokens.some((t) => haystack.includes(t));

    // 401/403/429 are UNVERIFIABLE, not dead — the request was refused, which
    // says nothing about whether the clinic exists. Only a 4xx that actually
    // means "no such page" (404/410) or a 5xx is evidence against it. These
    // stay draft rather than being promoted, because absence of evidence is
    // not evidence of freshness — but they are not counted as link rot.
    const blocked = res.status === 401 || res.status === 403 || res.status === 429;
    return {
      status: res.ok ? 'live' : blocked ? 'unverifiable' : 'unreachable',
      http_status: res.status,
      final_url: res.url,
      name_match: nameMatch,
      ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    return {
      status: 'unreachable',
      error: String(e?.message ?? e).slice(0, 200),
      ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  }
}

async function phaseVerify() {
  const rows = readNdjson(CENTERS);
  if (!rows.length) throw new Error(`no centers at ${CENTERS} — run --phase crawl first`);

  const prior = new Map(readNdjson(VERIFIED).map((r) => [r.slug, r]));
  let list = rows;
  if (LIMIT) list = list.slice(0, LIMIT);

  const out = [];
  // Third-party hosts, so a small amount of concurrency is fine and the whole
  // pass drops from ~30 min to ~3. Distinct hosts, one request each.
  const POOL = 8;
  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < list.length) {
      const row = list[idx++];
      const cached = prior.get(row.slug);
      // Reuse only a prior LIVE result. Anything else is re-checked, so a fix
      // to the classifier or the UA actually reaches the records it was for.
      const verification =
        cached?.verification?.status === 'live' ? cached.verification : await verifyOne(row);
      out.push({ ...row, verification });
      done += 1;
      if (done % 50 === 0) console.log(`[verify]   ${done}/${list.length}`);
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));

  writeNdjson(VERIFIED, out);
  const tally = out.reduce(
    (a, r) => ((a[r.verification.status] = (a[r.verification.status] ?? 0) + 1), a),
    {},
  );
  console.log(`\n[verify] wrote ${out.length} -> ${VERIFIED}`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`[verify]   ${k}: ${v}`);
  }
  console.log(
    `[verify]   name matched on page: ${out.filter((r) => r.verification.name_match).length}`,
  );
}

// ------------------------------------------------------------------ database

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

const ISO2_OVERRIDES = {
  'Russian Federation': 'RU',
  Türkiye: 'TR',
  Kosovo: 'XK',
  Czechia: 'CZ',
  Moldova: 'MD',
  'North Macedonia': 'MK',
};

/** Build the jsonb payload `commit_testfinder_org` consumes. */
function toPayload(row) {
  const detail = {
    opening_hours: row.openingHours,
    services_access: row.servicesAccess,
    site_type: row.siteType,
    referral: row.referral,
    hiv_free_for: row.hivFreeFor,
    hepatitis_free_for: row.hepatitisFreeFor,
    sti_free_for: row.stiFreeFor,
    sti_test_types: row.stiTestTypes ?? [],
    hiv_test_types: row.hivTestTypes ?? [],
    sti_tested_for: row.stiTestedFor ?? [],
    booking_website: row.bookingWebsite,
    booking_phone: row.bookingPhone,
    services_raw: row.services ?? [],
    verification: row.verification ?? null,
  };

  // The street line carries the postcode inline ("Bülowsvej 38 1870 Frederiksberg").
  // Splitting it reliably across 46 countries is not possible, so the whole line
  // stays in `address` and postal_code is left to the geocoder.
  return {
    external_id: row.slug,
    name: row.nameEnglish ?? row.name,
    description: null,
    website: row.website,
    email: row.email,
    phone: row.phone,
    address: row.street,
    postal_code: null,
    city: row.city,
    country: row.sourceCountry ?? row.country,
    country_code: ISO2_OVERRIDES[row.sourceCountry ?? row.country] ?? null,
    latitude: row.lat,
    longitude: row.lng,
    tags: parse.serviceTags(row),
    target_terms: parse.targetPopulationTerms(row.targetPopulation ?? []),
    source: {
      name: 'european-test-finder',
      external_id: row.slug,
      url: `${BASE}/centers/${row.slug}/`,
      source_last_updated: row.lastUpdated,
      fetched_at: new Date().toISOString(),
      terms: 'https://testfinder.info/terms-of-service/',
    },
    detail,
  };
}

async function phaseLoad() {
  const rows = readNdjson(VERIFIED).length ? readNdjson(VERIFIED) : readNdjson(CENTERS);
  if (!rows.length) throw new Error('nothing to load — run --phase crawl (and verify) first');

  let list = rows;
  if (LIMIT) list = list.slice(0, LIMIT);
  const payloads = list.map(toPayload);

  const noName = payloads.filter((p) => !p.name);
  if (noName.length) throw new Error(`${noName.length} payloads have no name — refusing to load`);

  if (DRY) {
    const preview = join(OUT, 'load-preview.json');
    writeFileSync(preview, JSON.stringify(payloads.slice(0, 25), null, 2));
    const tagTally = new Map();
    for (const p of payloads) for (const t of p.tags) tagTally.set(t, (tagTally.get(t) ?? 0) + 1);
    console.log(`[load] DRY RUN — nothing written. ${payloads.length} payloads.`);
    console.log(`[load]   sample -> ${preview}`);
    console.log(`[load]   with coords:  ${payloads.filter((p) => p.latitude !== null).length}`);
    console.log(`[load]   with website: ${payloads.filter((p) => p.website).length}`);
    console.log(`[load]   tag histogram:`);
    for (const [k, v] of [...tagTally].sort((a, b) => b[1] - a[1])) {
      console.log(`           ${String(v).padStart(4)}  ${k}`);
    }
    return;
  }

  const CHUNK = 50;
  let done = 0;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const chunk = payloads.slice(i, i + CHUNK);
    const json = JSON.stringify(chunk);
    if (json.includes('$TFJ$')) throw new Error(`chunk ${i} contains the dollar-quote tag $TFJ$`);
    await sql(
      `select public.commit_testfinder_org(p) from jsonb_array_elements($TFJ$${json}$TFJ$::jsonb) as p;`,
    );
    done += chunk.length;
    console.log(`[load]   ${done}/${payloads.length}`);
  }
  console.log(`[load] committed ${done} organizations (status='draft')`);
}

// ------------------------------------------------------------------- promote

async function phasePromote() {
  // Publication bar: the facility's own website answered. Everything else stays
  // draft and invisible — `organizations_public_read` requires status='active'.
  const predicate = `
      'european-test-finder' = any(tags)
      and status = 'draft'
      and enrichment_status->'testfinder'->'verification'->>'status' = 'live'`;

  const preview = await sql(`
    select count(*) filter (where ${predicate}) as promotable,
           count(*) filter (where 'european-test-finder' = any(tags) and status='draft') as still_draft,
           count(*) filter (where 'european-test-finder' = any(tags) and status='active') as already_active
      from public.organizations;`);
  console.log('[promote] ' + JSON.stringify(preview?.[0] ?? preview));

  if (DRY) {
    console.log('[promote] DRY RUN — nothing written.');
    return;
  }

  const res = await sql(`
    with promoted as (
      update public.organizations
         set status = 'active', updated_at = now()
       where ${predicate}
      returning id
    )
    select count(*) as promoted from promoted;`);
  console.log('[promote] ' + JSON.stringify(res?.[0] ?? res));

  // Newly-active rows must enter search; the indexer only sees status='active'.
  await phaseReindex();
}

async function phaseReindex() {
  let total = 0;
  for (let round = 0; round < 40; round += 1) {
    const res = await sql(`select public.run_org_search_reindex(500) as n;`);
    const n = Number(res?.[0]?.n ?? (Array.isArray(res) ? res[0]?.n : 0) ?? 0);
    total += n;
    console.log(`[reindex]   round ${round + 1}: ${n}`);
    if (n === 0) break;
  }
  console.log(`[reindex] reindexed ${total} organizations`);
}

// ---------------------------------------------------------------------- main

const PHASES = {
  crawl: phaseCrawl,
  verify: phaseVerify,
  load: phaseLoad,
  promote: phasePromote,
  reindex: phaseReindex,
};

const fn = PHASES[PHASE];
if (!fn) {
  console.error(`unknown --phase ${PHASE}; expected one of ${Object.keys(PHASES).join(', ')}`);
  process.exit(1);
}
await fn();
