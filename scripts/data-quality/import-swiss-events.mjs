#!/usr/bin/env node
/**
 * Import Swiss queer events + the venues that host them into ingestion_staging.
 *
 * Two sources, two completely different transports:
 *
 *   display-magazin.ch  WordPress + The Events Calendar. `/wp-json/tribe/events/v1/`
 *                       serves both `events` (217, 2025-12 -> 2027-01) and `venues`
 *                       (381) as clean JSON. There is NO HTML parsing here and there
 *                       must not be: the pre-existing `scrape_sources` row for this
 *                       site (20260228130100, disabled) guesses at CSS selectors for
 *                       a page that is server-rendered from this same API.
 *                       NOTE the default REST window is "now .. now+2y" — the wide
 *                       start_date/end_date params are what make the archive visible.
 *
 *   gay.ch              Plone 6 with plone.app.event. There is no usable API
 *                       (`++api++` answers NotFound, `/parties/ics_view` 500s), so
 *                       detail pages are parsed. The /parties/ listing only ever
 *                       shows the ~32 upcoming ones, so the archive is enumerated
 *                       from the sitemap UNIONED with the live catalog — see
 *                       discoverGaychUrls() for why the sitemap alone silently
 *                       lost 18 months.
 *
 * WHY GEOCODING IS PART OF THE IMPORT, not a follow-up backfill
 * ------------------------------------------------------------
 * pipeline-validate parks a row at `needs_review` on 3 warnings (warn_review_threshold
 * defaults to 3). An archive event with no coordinates scores W_EVENT_IN_PAST +
 * W_NO_GEO + W_DESCRIPTION_THIN = exactly 3, so importing the gay.ch back-catalogue
 * without coordinates would dump ~3.5k rows into a human review queue instead of the
 * corpus. Neither source publishes lat/lng, but both publish full street addresses,
 * and the ~430 DISTINCT venues behind 3,760 events geocode in one cheap pass. So the
 * venue registry is geocoded first and events inherit their venue's coordinates.
 *
 * IDENTITY (`source_entity_id`) — stable keys only, per the spartacus lesson:
 *   display-magazin events  WP post id            "22375"
 *   display-magazin venues  WP venue post id      "22564"
 *   gay-ch events           Plone path slug       "xoxo-2020-9"
 *   gay-ch venues           slug(name)|slug(city) "heaven|zuerich"   <- no native id
 *
 * Usage:
 *   node scripts/data-quality/import-swiss-events.mjs --phase fetch-dm
 *   node scripts/data-quality/import-swiss-events.mjs --phase fetch-gaych [--limit N]
 *   node scripts/data-quality/import-swiss-events.mjs --phase geocode
 *   node scripts/data-quality/import-swiss-events.mjs --phase stage --dry-run
 *   node scripts/data-quality/import-swiss-events.mjs --phase stage [--refresh]
 *   node scripts/data-quality/import-swiss-events.mjs --phase drain --entity venue
 *   node scripts/data-quality/import-swiss-events.mjs --phase drain --entity event
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const OUT = join(process.cwd(), 'out-swiss-events');
const CACHE = join(OUT, 'cache');
const UA = 'queer.guide-dataquality/1.0 (tmaeder@me.com)';

const DM = 'https://www.display-magazin.ch';
const GAYCH = 'https://gay.ch';

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);
const PHASE = flag('phase', 'fetch-dm');
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const DRY = has('dry-run');
const REFRESH = has('refresh');
const ENTITY = flag('entity', 'venue');

mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fetching

/**
 * Disk-cached GET. A re-run of any phase costs zero requests, which is what
 * makes it safe to iterate on the parser against 3.5k pages.
 */
async function getCached(url, { json = false } = {}) {
  const key = createHash('sha1').update(url).digest('hex') + (json ? '.json' : '.html');
  const path = join(CACHE, key);
  if (existsSync(path)) return readFileSync(path, 'utf8');

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html' },
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 404) {
        writeFileSync(path, '');
        return '';
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      // A Plone error page is short; a real party page is >8 KB. Caching a
      // truncated body would bake the failure in permanently.
      if (!json && body.length < 2000) throw new Error(`short body ${body.length}`);
      writeFileSync(path, body);
      return body;
    } catch (e) {
      lastErr = e;
      await sleep(800 * attempt);
    }
  }
  throw new Error(`fetch failed ${url}: ${lastErr?.message}`);
}

// ---------------------------------------------------------------- helpers

/**
 * HTML -> plain text. Two orderings here are load-bearing, both flagged by
 * CodeQL on the first version of this file:
 *
 * 1. `</script>` must be matched as `</script\s*>`. A closing tag may carry
 *    whitespace before the `>`, and the strict form leaves the whole script
 *    body in the extracted text (js/bad-tag-filter).
 *
 * 2. `&amp;` is decoded LAST. Decoding it first turns `&amp;lt;` into `&lt;`
 *    and the next rule turns that into `<` — a literal, escaped "&lt;" in the
 *    source silently becomes markup (js/double-escaping). Numeric entities run
 *    before it for the same reason and are safe there, because `&amp;#60;`
 *    contains no `&#60;` substring.
 */
const stripTags = (s) =>
  String(s || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Country resolution is EVIDENCE-BASED and returns null rather than guessing.
 *
 * Both `venues.country` and `events.country` accept NULL (the ISO2 CHECK is
 * `country IS NULL OR country ~ '^[A-Z]{2}$'`), and `derive_entity_geo_address`
 * fills it from the linked city later. A wrong country is not recoverable the
 * same way — it drives safety-gating and city linking — so "no evidence" must
 * stay empty. See the AZ/Sedona->Azerbaijan class of bug in CLAUDE.md.
 */
const COUNTRY_WORDS = {
  schweiz: 'CH',
  switzerland: 'CH',
  suisse: 'CH',
  svizzera: 'CH',
  ch: 'CH',
  deutschland: 'DE',
  germany: 'DE',
  de: 'DE',
  österreich: 'AT',
  austria: 'AT',
  at: 'AT',
  france: 'FR',
  frankreich: 'FR',
  italia: 'IT',
  italien: 'IT',
  liechtenstein: 'LI',
};
function resolveCountry({ country, address, city }) {
  const w = String(country || '')
    .trim()
    .toLowerCase();
  if (w && COUNTRY_WORDS[w]) return COUNTRY_WORDS[w];

  const blob = `${address || ''} ${city || ''}`;
  // Swiss postal codes are 4 digits, 1000-9999. German are 5 digits. Both
  // sources write them immediately before the town name.
  if (/\b[1-9]\d{3}\s+[A-Za-zÀ-ÿ]/.test(blob)) return 'CH';
  if (/\b\d{5}\s+[A-Za-zÀ-ÿ]/.test(blob)) return 'DE';
  return null;
}

/**
 * Recover "<postal> <Town>" from the tail of a free-text address.
 *
 * Tribe's `city` field is optional and 59 of the 381 display-magazin venue
 * records leave it empty while writing the town INTO the address
 * ("Kasernenhof 8 4058 Basel", "Rämistrasse 6, Eingang Freieckgasse, 8001
 * Zürich"). Those rows are not location-less, they are shaped differently —
 * and `city` is what run_event_city_link keys on, so leaving it null costs
 * city_id and everything derived from it.
 */
/**
 * A city that is only digits is a postal code in the wrong field.
 *
 * Two display-magazin venue records carry city='8002' and city='4053', and
 * `venues_city_nonjunk_check` / `events_city_nonjunk_check` both forbid a
 * purely numeric city — so passing it straight through does not produce a bad
 * row, it produces a rejected staging item. Route it to postal_code instead.
 */
const cityOrPostal = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return { city: null, postal: null };
  return /^\d{4,5}$/.test(s) ? { city: null, postal: s } : { city: s, postal: null };
};

function cityFromAddress(address) {
  const m = String(address || '')
    .trim()
    .replace(/,\s*$/, '')
    .match(/(\d{4,5})\s+([^,\d]{2,})$/);
  if (!m) return { postal: null, city: null };
  return { postal: m[1], city: m[2].trim() };
}

/** Split "Heaven, Spitalgasse 5, 8001 Zürich" into its parts. */
function splitGayChLocation(text) {
  const t = stripTags(text)
    .replace(/\s*Map\s*$/, '')
    .trim();
  if (!t) return null;
  const segs = t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!segs.length) return null;
  const name = segs[0];
  // The last segment carrying "<postal> <town>" is the city line; everything
  // between the name and it is street address.
  let cityIdx = -1;
  for (let i = segs.length - 1; i >= 1; i--) {
    if (/^\d{4,5}\s+\S/.test(segs[i])) {
      cityIdx = i;
      break;
    }
  }
  let city = null;
  let postal = null;
  if (cityIdx >= 0) {
    const m = segs[cityIdx].match(/^(\d{4,5})\s+(.+)$/);
    postal = m[1];
    city = m[2].trim();
  } else if (segs.length > 1) {
    city = segs[segs.length - 1];
  }
  const streetSegs = segs.slice(1, cityIdx >= 0 ? cityIdx : segs.length);
  return {
    name,
    street: streetSegs.join(', ') || null,
    postal,
    city,
    full: t,
  };
}

// ---------------------------------------------------------------- phase: fetch-dm

async function phaseFetchDm() {
  const pull = async (kind) => {
    const out = [];
    let page = 1;
    for (;;) {
      // The archive is only reachable with an explicit window — the default is
      // now..now+2y and silently hides every past event.
      const window =
        kind === 'events'
          ? '&start_date=2000-01-01%2000:00:00&end_date=2035-12-31%2023:59:59&status=publish'
          : '';
      const url = `${DM}/wp-json/tribe/events/v1/${kind}?per_page=50&page=${page}${window}`;
      const d = JSON.parse(await getCached(url, { json: true }));
      const items = d[kind] ?? [];
      if (!items.length) break;
      out.push(...items);
      const tp = d.total_pages ?? 1;
      console.log(`[fetch-dm] ${kind} page ${page}/${tp} (${out.length})`);
      if (page >= tp) break;
      page++;
      await sleep(250);
    }
    return out;
  };

  const events = await pull('events');
  const venues = await pull('venues');
  writeFileSync(join(OUT, 'dm-events.json'), JSON.stringify(events));
  writeFileSync(join(OUT, 'dm-venues.json'), JSON.stringify(venues));
  console.log(`[fetch-dm] ${events.length} events, ${venues.length} venues`);
}

// ---------------------------------------------------------------- phase: fetch-gaych

/**
 * Plone emits a schema.org Event object in a BARE `<script>` — no
 * `type="application/ld+json"` attribute, which is why a conventional JSON-LD
 * grep reports zero blocks on this site and why the listing page looked like the
 * only structured source. It carries name/description/image/startDate/endDate
 * plus a structured PostalAddress, so it is the authority for everything it
 * covers; the HTML below it is only consulted for what it does not (body prose,
 * admission price, external links, keywords).
 */
function gayChJsonLd(html) {
  const m = html.match(/<script>(\{"@context":\s*"https:\/\/schema\.org"[\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    return d && d['@type'] === 'Event' ? d : null;
  } catch {
    return null;
  }
}

function parseGayChEvent(html, url) {
  const ld = gayChJsonLd(html);
  const title =
    stripTags(ld?.name) ||
    stripTags((html.match(/<h1 class="documentFirstHeading">([\s\S]*?)<\/h1>/) || [])[1]);
  if (!title) return null;

  const start =
    ld?.startDate || (html.match(/<abbr class="dtstart" title="([^"]+)"/) || [])[1] || null;
  const end = ld?.endDate || (html.match(/<abbr class="dtend" title="([^"]+)"/) || [])[1] || null;
  if (!start) return null;

  let loc = null;
  if (ld?.location?.name) {
    const a = ld.location.address || {};
    loc = {
      name: stripTags(ld.location.name),
      street: stripTags(a.street) || null,
      postal: a.postalCode ? String(a.postalCode) : null,
      city: stripTags(a.addressLocality) || null,
      country: stripTags(a.addressCountry) || null,
      full: [
        ld.location.name,
        a.street,
        [a.postalCode, a.addressLocality].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', '),
    };
  } else {
    // Pre-schema.org pages: the venue line is the only <p> inside
    // eventSummaryTile that is not the date.
    const summary = (html.match(/<div class="eventSummaryTile">([\s\S]*?)<\/div>/) || [])[1] || '';
    const locHtml = (summary.match(/<p><span>([\s\S]*?)<\/span><\/p>/) || [])[1] || '';
    loc = splitGayChLocation(locHtml.replace(/<a class="google_maps_link"[\s\S]*$/, ''));
  }

  const description =
    stripTags(ld?.description) ||
    stripTags((html.match(/<div class="documentDescription">([\s\S]*?)<\/div>/) || [])[1]);
  const body = stripTags(
    (html.match(
      /mosaic-IRichTextBehavior-text-tile">\s*<div class="mosaic-tile-content">([\s\S]*?)<\/div>\s*<\/div>/,
    ) || [])[1],
  );
  const image =
    ld?.image ||
    (html.match(
      /<img[^>]+src="(https:\/\/gay\.ch\/parties\/[^"]+@@images\/[^"]+)"[^>]*width="\d{3,}"/,
    ) || [])[1] ||
    (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] ||
    null;

  // The right-hand summary tile carries Eintritt / Webseite / Facebook / Instagram.
  const side =
    (html.match(
      /mosaic-ISummaryText-summary-tile">\s*<div class="mosaic-tile-content">([\s\S]*?)<\/div>\s*<\/div>/,
    ) || [])[1] || '';
  const sideText = stripTags(side);
  const cost = (sideText.match(/Eintritt:\s*([^\n]+)/) || [])[1]?.trim() || null;
  const links = [...side.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const website =
    links.find((l) => !/facebook|instagram|tiktok|twitter|x\.com|youtube/i.test(l)) || null;

  // Subject keywords double as the city tag and the venue tag.
  const tags = [...(html.match(/class="link-category"[^>]*>([\s\S]*?)<\/a>/g) || [])].map((s) =>
    stripTags(s),
  );

  return {
    source: 'gay-ch',
    sourceId: url.replace(/^.*\/parties\//, '').replace(/\/$/, ''),
    url,
    title,
    start,
    end,
    description: description || null,
    body: body || null,
    image,
    cost,
    website,
    tags,
    venue: loc,
  };
}

/**
 * Enumerate every party URL from the LIVE Plone catalog.
 *
 * The sitemap is not a complete index and trusting it silently lost 18 months.
 * It lists 3,543 party pages; `@@search?portal_type=Event` reports 4,507. The
 * hole is 2025-01 through 2026-07, and it is provable rather than inferred:
 * gay.ch numbers recurring series sequentially, the sitemap jumps straight from
 * `kweeraoke-21` (2024-11) to `kweeraoke-40` (2026-08), and `kweeraoke-25`,
 * `-30` and `-39` all answer 200. Nothing in the sitemap says it is partial.
 *
 * Results are batched 10 at a time, so this costs ~451 requests to avoid
 * missing ~960 events. `sort_on=created` is required: the default is relevance,
 * which is not a stable order to page through.
 */
async function discoverGaychUrls() {
  const found = new Set();
  const first = await getCached(
    `${GAYCH}/@@search?portal_type=Event&sort_on=created&b_start:int=0`,
  );
  const total = Number(
    first
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .match(/(\d+)\s*Inhalte gefunden/)?.[1] ?? 0,
  );
  console.log(`[discover] catalog reports ${total} Events`);

  for (let start = 0; start <= total; start += 10) {
    const html =
      start === 0
        ? first
        : await getCached(
            `${GAYCH}/@@search?portal_type=Event&sort_on=created&b_start:int=${start}`,
          );
    // Underscores are legal in a Plone id ("copy_of_lila-26-queer-festival-samstag")
    // and omitting them truncates the URL to a prefix that 404s.
    for (const m of html.matchAll(/https:\/\/gay\.ch\/parties\/[a-z0-9][a-z0-9_-]*/g))
      found.add(m[0]);
    if (start % 500 === 0) console.log(`[discover] ${start}/${total} → ${found.size} party urls`);
    if (start > 0) await sleep(200);
  }
  return found;
}

/**
 * Slugs that must exist but appear in NEITHER index.
 *
 * The catalog turned out to be incomplete too, not just the sitemap:
 * `@@search?SearchableText=Kweeraoke` returns exactly 24 items and
 * `kweeraoke-22` … `-39` are not among them, yet `kweeraoke-30` serves a real
 * event dated 2025-11-20. Those pages are viewable and simply not indexed, so
 * no index-based enumeration can ever reach them — probing the site's own
 * numbering is the only mechanism left. Spot-checked before building on it:
 * kweeraoke-22, karaoke-kweer-35 and night-pride-40 all answer 200 with 2025
 * dates, and kweeraoke-999 answers a clean 404.
 *
 * Only DENSE, low-numbered runs are treated as a series. A slug ending in a
 * year ("eurovision-2016", "molke-4000") is a title, not an index, and probing
 * its "gaps" would mean thousands of requests for nothing.
 *
 * This converges: once a round fills 22..39, the next round finds no gaps.
 */
function gapSlugs(parsed) {
  const series = new Map();
  for (const e of parsed) {
    const m = /^(.*?)-(\d+)$/.exec(e.sourceId);
    if (!m) continue;
    if (!series.has(m[1])) series.set(m[1], new Set());
    series.get(m[1]).add(Number(m[2]));
  }
  const out = [];
  for (const [base, nums] of series) {
    const max = Math.max(...nums);
    if (max > 300 || nums.size < 5 || nums.size / max < 0.35) continue;
    for (let n = 1; n < max; n++) if (!nums.has(n)) out.push(`${base}-${n}`);
    // Past the end, for a series whose TAIL is the uncatalogued part. The
    // window is wide because `heldenbar-zh` is weekly and its whole 2025 run is
    // invisible to both indexes: a narrow window advances by its own width per
    // round and would need ~20 passes. A 404 costs one cached request.
    for (let n = max + 1; n <= max + 25; n++) out.push(`${base}-${n}`);
  }
  return out;
}

async function phaseFetchGaych() {
  const smPath = join(OUT, 'gaych-sitemap.xml');
  if (!existsSync(smPath)) {
    const res = await fetch(`${GAYCH}/sitemap.xml.gz`, { headers: { 'User-Agent': UA } });
    const gz = Buffer.from(await res.arrayBuffer());
    const { gunzipSync } = await import('node:zlib');
    writeFileSync(smPath, gunzipSync(gz));
  }
  const xml = readFileSync(smPath, 'utf8');
  const fromSitemap = [
    ...new Set(
      [...xml.matchAll(/<loc>(https:\/\/gay\.ch\/parties\/[^<]+)<\/loc>/g)].map((m) => m[1]),
    ),
  ]
    // /parties itself and the paged views are collections, not events.
    .filter((u) => !/\/parties\/?$/.test(u) && !/@@/.test(u));

  // Union, not replacement: the catalog is the authority on what exists, but a
  // quirk in one enumeration must not silently drop what the other found.
  const fromCatalog = await discoverGaychUrls();

  const outPath = join(OUT, 'gaych-events.ndjson');
  const probes = gapSlugs(readNdjson(outPath)).map((s) => `${GAYCH}/parties/${s}`);
  const urls = [...new Set([...fromSitemap, ...fromCatalog, ...probes])];
  console.log(
    `[fetch-gaych] sitemap ${fromSitemap.length}, catalog ${fromCatalog.size}, ` +
      `series probes ${probes.length}, union ${urls.length}`,
  );

  const donePath = join(OUT, 'gaych-done.txt');
  const done = existsSync(donePath)
    ? new Set(readFileSync(donePath, 'utf8').split('\n').filter(Boolean))
    : new Set();

  const todo = urls.filter((u) => !done.has(u)).slice(0, LIMIT);
  console.log(`[fetch-gaych] ${todo.length} to fetch (${done.size} already done)`);

  let ok = 0;
  let skipped = 0;
  for (let i = 0; i < todo.length; i++) {
    const url = todo[i];
    try {
      const html = await getCached(url);
      if (html) {
        const rec = parseGayChEvent(html, url);
        if (rec) {
          appendFileSync(outPath, JSON.stringify(rec) + '\n');
          ok++;
        } else skipped++;
      } else skipped++;
      appendFileSync(donePath, url + '\n');
    } catch (e) {
      console.warn(`[fetch-gaych] ${url}: ${e.message}`);
    }
    if (i % 100 === 0) console.log(`[fetch-gaych] ${i}/${todo.length} ok=${ok} skip=${skipped}`);
    await sleep(220);
  }
  console.log(`[fetch-gaych] done ok=${ok} skipped=${skipped}`);
}

// ---------------------------------------------------------------- venue registry

/**
 * Tolerant of a truncated final line: the crawl appends while `--phase geocode`
 * may be reading, so the last record can be half-written. Dropping it is right —
 * the crawl is resumable and will emit it again.
 */
const readNdjson = (p) => {
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* partial write */
    }
  }
  return out;
};

/**
 * One row per DISTINCT physical venue across both sources.
 *
 * display-magazin venues have their own WP id and are authoritative (they carry
 * a structured city/province/country). gay.ch venues exist only as the text line
 * on each party page, so they are keyed by slug(name)|slug(city) and folded
 * across the ~3.5k parties that repeat them.
 */
function buildVenueRegistry() {
  const reg = new Map();

  for (const v of JSON.parse(readFileSync(join(OUT, 'dm-venues.json'), 'utf8'))) {
    const name = stripTags(v.venue);
    if (!name) continue;
    const fromAddr = cityFromAddress(v.address);
    const raw = cityOrPostal(stripTags(v.city));
    const city = raw.city || fromAddr.city;
    reg.set(`dm:${v.id}`, {
      source: 'display-magazin',
      sourceId: String(v.id),
      name,
      street: stripTags(v.address) || null,
      postal: fromAddr.postal || raw.postal,
      city,
      state: stripTags(v.stateprovince || v.province) || null,
      country: resolveCountry({
        country: v.country,
        address: `${v.address || ''} ${raw.postal || ''}`,
        city,
      }),
      url: v.url || null,
      // NEVER fall back to the bare venue name — see geocodable(). The postal
      // code is included because for the records whose `city` was really a
      // postal code it is the ONLY locality signal left after cityOrPostal().
      geoQuery:
        [stripTags(v.address), fromAddr.postal || raw.postal, city, v.country]
          .filter(Boolean)
          .join(', ') || null,
    });
  }

  for (const e of readNdjson(join(OUT, 'gaych-events.ndjson'))) {
    const loc = e.venue;
    if (!loc?.name) continue;
    const key = `gaych:${slug(loc.name)}|${slug(loc.city || '')}`;
    if (reg.has(key)) continue;
    reg.set(key, {
      source: 'gay-ch',
      sourceId: `${slug(loc.name)}|${slug(loc.city || '')}`,
      name: loc.name,
      street: loc.street,
      postal: loc.postal,
      city: loc.city,
      state: null,
      country: resolveCountry({ country: loc.country, address: loc.full, city: loc.city }),
      url: null,
      geoQuery: loc.full,
    });
  }

  return reg;
}

/** Stable cross-source key so an event can find its venue's coordinates. */
const geoKey = (v) => `${slug(v.name)}|${slug(v.city || '')}`;

// ---------------------------------------------------------------- phase: geocode

const PHOTON = 'https://photon.komoot.io/api/';

/**
 * The only countries these two sources actually publish venues in.
 *
 * Not a guess: across the labelled subset, every venue resolves to CH or DE,
 * and the unlabelled remainder is Swiss by postal code. AT/FR/IT/LI are here
 * because a Zurich or Basel agenda legitimately reaches just over the border.
 */
const PLAUSIBLE_CC = new Set(['CH', 'DE', 'AT', 'FR', 'IT', 'LI']);

/**
 * A venue is geocodable only if the source gave a PLACE, not just a name.
 *
 * This guard exists because its absence was measured. `geoQuery` used to fall
 * back to the bare venue name, and Photon dutifully resolved 'Swing Werk' to
 * Swinging Limb Road, Tennessee; 'Komplex Klub' to a forested hill in Czechia;
 * 'Ritmo' to Moscow; 'Kultarena' to Lund, Sweden. Six of the seven had NO
 * address, NO city and NO country in the source — there was nothing to geocode
 * and the right answer was to say so. A null coordinate is recoverable; a Basel
 * bar plotted in Tel Aviv is not.
 */
const geocodable = (v) => Boolean(v.geoQuery && (v.street || v.city || v.postal));

async function photon(q, countryHint) {
  if (!q) return null;
  const url = new URL(PHOTON);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '1');
  url.searchParams.set('lang', 'en');
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) return null;
  const j = await res.json();
  const f = j?.features?.[0];
  const c = f?.geometry?.coordinates; // GeoJSON is [lng, lat]
  if (!Array.isArray(c) || c.length < 2) return null;
  const lng = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return null; // Null Island
  // A hit in a different country than the address states is a mismatch, not a
  // near-miss — dropping it keeps a Zurich bar out of Zurich, Ontario.
  const cc = f?.properties?.countrycode ? String(f.properties.countrycode).toUpperCase() : null;
  if (countryHint && cc && cc !== countryHint) return null;
  // With no stated country there is nothing to compare against, so the result
  // is judged against what these sources plausibly contain instead. Photon
  // always answers something; "somewhere in Russia" is that answer being wrong.
  if (!countryHint && cc && !PLAUSIBLE_CC.has(cc)) return null;
  return { lat, lng, cc, matched: f?.properties?.name || null };
}

async function phaseGeocode() {
  const reg = buildVenueRegistry();
  const path = join(OUT, 'geo.json');
  const geo = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};

  // Record the un-geocodable ones as a decided null so they are never retried,
  // and so `stage` can tell "no place in the source" from "not looked up yet".
  let skipped = 0;
  for (const v of reg.values()) {
    if (!geocodable(v) && !(geoKey(v) in geo)) {
      geo[geoKey(v)] = null;
      skipped++;
    }
  }

  const todo = [...reg.values()]
    .filter((v) => geocodable(v) && !(geoKey(v) in geo))
    .slice(0, LIMIT);
  console.log(
    `[geocode] ${reg.size} venues, ${todo.length} to geocode, ${skipped} with no address at all`,
  );

  let hits = 0;
  for (let i = 0; i < todo.length; i++) {
    const v = todo[i];
    const k = geoKey(v);
    let hit = null;
    try {
      hit = await photon(v.geoQuery, v.country);
      if (!hit && v.street && v.city) {
        await sleep(1100);
        hit = await photon(`${v.street}, ${v.city}`, v.country);
      }
      if (!hit && v.city) {
        await sleep(1100);
        // Last resort is the town centroid. It is recorded as such so the row
        // is never mistaken for a surveyed position.
        const c = await photon(v.city, v.country);
        if (c) hit = { ...c, centroid: true };
      }
    } catch (e) {
      console.warn(`[geocode] ${v.name}: ${e.message}`);
    }
    geo[k] = hit || null;
    if (hit) hits++;
    if (i % 25 === 0) {
      writeFileSync(path, JSON.stringify(geo));
      console.log(`[geocode] ${i}/${todo.length} hits=${hits}`);
    }
    await sleep(1100); // Photon's public instance asks for ~1 req/s.
  }
  writeFileSync(path, JSON.stringify(geo));
  const resolved = Object.values(geo).filter(Boolean).length;
  console.log(`[geocode] done — ${resolved}/${Object.keys(geo).length} resolved`);
}

// ---------------------------------------------------------------- normalize

/**
 * Tribe returns local WALL TIME with no offset ("2025-12-27 16:00:00") plus a
 * separate IANA `timezone` field, so the offset has to be resolved per instant
 * — a fixed "+02:00" is right for July and an hour wrong for December, and the
 * archive being imported spans both. Round-trip through Intl to recover the
 * zone's actual offset at that moment.
 *
 * gay.ch needs none of this: its schema.org block already carries an explicit
 * +01:00 / +02:00.
 */
function wallTimeToIso(s, tz = 'Europe/Zurich') {
  const raw = String(s || '').trim();
  if (!raw) return null;
  const asUtc = new Date(raw.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(asUtc.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(asUtc)
      .map((p) => [p.type, p.value]),
  );
  const back = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(asUtc.getTime() - (back - asUtc.getTime())).toISOString();
}

/** display-magazin event category slug -> events_event_type_check vocabulary. */
const DM_TYPE = {
  'party-nightlife': 'party',
  'pride-festivals': 'pride',
  'film-kino': 'film',
  'community-stammtisch': 'community',
  'theater-buehne': 'theater',
  'sport-outdoor': 'sports',
  'konzerte-musik': 'concert',
  'kunst-ausstellungen': 'art',
  'bildung-politik': 'workshop',
  'literatur-talks': 'workshop',
  'food-drinks': 'social',
  weitere: 'other',
};

/**
 * Country, in descending order of evidence.
 *
 * A street-level Photon hit is a real observation of where the address is, and
 * it is already double-gated (it must agree with any stated country, and must
 * be a country these sources plausibly cover), so it counts as evidence.
 * A CITY-CENTROID hit does not: that came from resolving a bare town name, the
 * exact move CLAUDE.md warns about. Null stays null there — `derive_entity_geo_address`
 * fills country from city_id later, and a wrong country is not undoable.
 */
const countryOf = (explicit, g) => explicit || (g && !g.centroid && g.cc ? g.cc : null);
const countrySource = (explicit, g) =>
  explicit ? 'source' : countryOf(explicit, g) ? 'photon' : null;

function venuePayload(v, geo) {
  const g = geo[geoKey(v)] || null;
  return {
    sourceId: v.sourceId,
    name: v.name,
    category: 'unknown', // commit defaults this; the sources publish no category
    location: {
      address: v.street || null,
      city: v.city || null,
      state: v.state || null,
      postal_code: v.postal || null,
      country: countryOf(v.country, g),
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
    },
    contacts: { website: v.url || null },
    tags: ['lgbtq'],
    metadata: {
      url: v.url || null,
      source: v.source,
      geo_source: g ? (g.centroid ? 'photon:city_centroid' : 'photon:address') : null,
      country_source: countrySource(v.country, g),
      geo_matched: g?.matched ?? null,
    },
  };
}

function dmEventPayload(e, geo) {
  const v = e.venue && !Array.isArray(e.venue) ? e.venue : null;
  // Same shape-recovery as the venue registry — and it MUST match, because the
  // geo lookup key is derived from the city.
  const fromAddr = v ? cityFromAddress(v.address) : { postal: null, city: null };
  const rawCity = cityOrPostal(v ? stripTags(v.city) : null);
  const city = rawCity.city || fromAddr.city;
  const g = v ? geo[`${slug(stripTags(v.venue))}|${slug(city || '')}`] : null;
  const explicitCountry = v
    ? resolveCountry({ country: v.country, address: v.address, city })
    : null;
  const type = DM_TYPE[e.categories?.[0]?.slug] || 'other';
  const toIso = (s) => wallTimeToIso(s, e.timezone || 'Europe/Zurich');

  return {
    sourceId: String(e.id),
    name: stripTags(e.title),
    title: stripTags(e.title),
    description: stripTags(e.description) || stripTags(e.excerpt) || null,
    event_type: type,
    start_date: toIso(e.start_date),
    end_date: toIso(e.end_date),
    dates: { start: toIso(e.start_date), end: toIso(e.end_date) },
    venue_name: v ? stripTags(v.venue) : null,
    website: e.website || e.url || null,
    ticket_url: e.website || e.url || null,
    location: {
      address: v ? stripTags(v.address) || null : null,
      city,
      postal_code: fromAddr.postal || rawCity.postal,
      state: v ? stripTags(v.stateprovince || v.province) || null : null,
      country: countryOf(explicitCountry, g),
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      timezone: e.timezone || 'Europe/Zurich',
    },
    images: e.image?.url ? [e.image.url] : [],
    tags: ['lgbtq', ...(e.tags || []).map((t) => t.slug)].slice(0, 20),
    urls: [e.url].filter(Boolean),
    metadata: {
      url: e.url,
      source: 'display-magazin',
      wp_id: e.id,
      cost: e.cost || null,
      categories: (e.categories || []).map((c) => c.slug),
      geo_source: g ? (g.centroid ? 'photon:city_centroid' : 'photon:address') : null,
      country_source: countrySource(explicitCountry, g),
    },
  };
}

function gaychEventPayload(e, geo) {
  const v = e.venue;
  const g = v ? geo[`${slug(v.name)}|${slug(v.city || '')}`] : null;
  const explicitCountry = v
    ? resolveCountry({ country: v.country, address: v.full, city: v.city })
    : null;
  const desc = [e.description, e.body].filter(Boolean).join('\n\n').trim();
  return {
    sourceId: e.sourceId,
    name: e.title,
    title: e.title,
    description: desc || null,
    // gay.ch's /parties/ tree is a party listing by construction. It is the
    // section's editorial definition, not a guess from the title.
    event_type: 'party',
    start_date: e.start,
    end_date: e.end,
    dates: { start: e.start, end: e.end },
    venue_name: v?.name || null,
    website: e.website || null,
    ticket_url: e.url,
    location: {
      address: v?.street || null,
      city: v?.city || null,
      postal_code: v?.postal || null,
      country: countryOf(explicitCountry, g),
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      timezone: 'Europe/Zurich',
    },
    images: e.image ? [e.image] : [],
    tags: ['lgbtq', ...(e.tags || []).map((t) => slug(t))].slice(0, 20),
    urls: [e.url],
    metadata: {
      url: e.url,
      source: 'gay-ch',
      cost: e.cost || null,
      keywords: e.tags || [],
      geo_source: g ? (g.centroid ? 'photon:city_centroid' : 'photon:address') : null,
      country_source: countrySource(explicitCountry, g),
    },
  };
}

// ---------------------------------------------------------------- staging

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql(query, attempt = 1) {
  const MAX = 5;
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
      if ((res.status === 429 || res.status >= 500) && attempt < MAX) {
        console.warn(`[sql] ${res.status}, retry ${attempt}`);
        await sleep(2000 * attempt);
        return sql(query, attempt + 1);
      }
      throw new Error(`mgmt API ${res.status}: ${body}`);
    }
    return res.json();
  } catch (e) {
    if (e instanceof Error && !/^mgmt API \d/.test(e.message) && attempt < MAX) {
      console.warn(`[sql] ${e.message}, retry ${attempt}`);
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

async function insertBatch(rows, { sourceName, targetTable, entityType }) {
  const CHUNK = 100;
  let done = 0;
  let refreshed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const payload = JSON.stringify(rows.slice(i, i + CHUNK));
    if (payload.includes('$J$')) throw new Error(`chunk ${i} contains the dollar-quote tag $J$`);

    await sql(`
insert into public.ingestion_staging
  (raw_data, normalized_data, target_table, entity_type, source_type, source_name,
   source_entity_id, payload_hash,
   ai_validation_status, dedup_status, enrichment_status, review_status, disposition)
select
  jsonb_build_object('source','${sourceName}','url', n->'metadata'->>'url'),
  n, '${targetTable}', '${entityType}', '${sourceName}', '${sourceName}',
  n->>'sourceId',
  encode(extensions.digest(n::text,'sha256'),'hex'),
  'pending','pending','pending','auto','pending'
from jsonb_array_elements($J$${payload}$J$::jsonb) as n
on conflict do nothing;`);

    if (REFRESH) {
      // Re-opening a row means restoring EVERY column the stages select on —
      // pipeline-validate filters .eq('entity_type', …), so a row left with a
      // stale entity_type is invisible to it forever.
      const r = await sql(`
update public.ingestion_staging s
set normalized_data = n,
    raw_data = jsonb_build_object('source','${sourceName}','url', n->'metadata'->>'url'),
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
where s.source_name = '${sourceName}'
  and s.source_entity_id = n->>'sourceId'
  -- A rejected row is invisible to ux_ingestion_staging_source_idem (the index is
  -- partial on disposition <> 'rejected'), so the INSERT above already re-added it
  -- as a fresh pending row carrying this exact payload_hash. Updating the rejected
  -- row too would then collide on uk_ingestion_staging_idem
  -- (source_type, source_entity_id, payload_hash) and abort the whole run.
  and s.disposition <> 'rejected'
  and s.payload_hash is distinct from encode(extensions.digest(n::text,'sha256'),'hex')
returning 1;`);
      refreshed += (r.result ?? r ?? []).length;
    }

    done += Math.min(CHUNK, rows.length - i);
    console.log(
      `[stage] ${sourceName}/${entityType} ${done}/${rows.length}${REFRESH ? ` (refreshed ${refreshed})` : ''}`,
    );
  }
}

const tally = (rows, f) =>
  rows.reduce((a, r) => {
    const k = f(r) ?? '∅';
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});

async function phaseStage() {
  const geo = existsSync(join(OUT, 'geo.json'))
    ? JSON.parse(readFileSync(join(OUT, 'geo.json'), 'utf8'))
    : {};
  if (!Object.keys(geo).length) {
    throw new Error('geo.json is empty — run `--phase geocode` first (see the header comment)');
  }

  const reg = buildVenueRegistry();
  const dmEvents = JSON.parse(readFileSync(join(OUT, 'dm-events.json'), 'utf8'));
  const gcEvents = readNdjson(join(OUT, 'gaych-events.ndjson'));

  const groups = [
    {
      sourceName: 'display-magazin',
      targetTable: 'venues',
      entityType: 'venue',
      rows: [...reg.values()]
        .filter((v) => v.source === 'display-magazin')
        .map((v) => venuePayload(v, geo)),
    },
    {
      sourceName: 'gay-ch',
      targetTable: 'venues',
      entityType: 'venue',
      rows: [...reg.values()].filter((v) => v.source === 'gay-ch').map((v) => venuePayload(v, geo)),
    },
    {
      sourceName: 'display-magazin',
      targetTable: 'events',
      entityType: 'event',
      rows: dmEvents.map((e) => dmEventPayload(e, geo)),
    },
    {
      sourceName: 'gay-ch',
      targetTable: 'events',
      entityType: 'event',
      rows: gcEvents.map((e) => gaychEventPayload(e, geo)),
    },
  ];

  for (const g of groups) {
    // A row with no name/title is rejected by validate and a row with no start
    // date is rejected by commit; dropping them here keeps the reject counters
    // meaningful instead of burning a full pipeline pass on known-bad input.
    g.rows = g.rows.filter((r) => r.name && (g.entityType === 'venue' || r.start_date));
    const withGeo = g.rows.filter((r) => r.location?.lat != null).length;
    const withCity = g.rows.filter((r) => r.location?.city).length;
    console.log(
      `[stage] ${g.sourceName}/${g.entityType}: ${g.rows.length} rows, ` +
        `geo ${withGeo}, city ${withCity}, country ${JSON.stringify(tally(g.rows, (r) => r.location?.country))}`,
    );
  }

  if (DRY) {
    writeFileSync(
      join(OUT, 'staged-preview.json'),
      JSON.stringify(
        groups.map((g) => ({ ...g, rows: g.rows.slice(0, 3) })),
        null,
        2,
      ),
    );
    console.log(`[stage] DRY RUN — sample at ${join(OUT, 'staged-preview.json')}`);
    return;
  }

  for (const g of groups) await insertBatch(g.rows, g);
  console.log('[stage] done');
}

// ---------------------------------------------------------------- drain

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

const SOURCES = "('display-magazin','gay-ch')";

/**
 * Fire one pipeline stage via pg_net so the internal-invoke secret is read from
 * the vault inside the database and never leaves it. These MUST be serialised:
 * the stage functions select work with a plain `.eq(status,'pending')` + limit
 * and no FOR UPDATE SKIP LOCKED, so concurrent calls fight over the same rows.
 */
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
where source_name in ${SOURCES} and target_table='${targetTable}'
  and disposition = 'pending' and ${predicate};`);
  return Number((res.result ?? res)[0].n);
}

async function drainStage(label, fn, entityType, targetTable, predicate, batchSize) {
  let stall = 0;
  let prev = await countActionable(targetTable, predicate);
  console.log(`[drain] ${label}: ${prev} pending`);
  while (prev > 0) {
    await firePipelineStage(fn, entityType, batchSize);
    await sleep(35_000);
    const now = await countActionable(targetTable, predicate);
    // Two identical readings means the stage is parking rows in a status this
    // loop does not count — spinning would be an infinite loop, not a wait.
    if (now >= prev) {
      if (++stall >= 2) {
        console.warn(`[drain] ${label}: STALLED at ${now} — inspect manually`);
        return false;
      }
    } else stall = 0;
    prev = now;
    console.log(`[drain] ${label}: ${now} pending`);
  }
  return true;
}

async function phaseDrain() {
  const targetTable = ENTITY === 'event' ? 'events' : 'venues';
  const commitFn = ENTITY === 'event' ? 'commit_event_staging_batch' : 'commit_venue_staging_batch';

  if (
    !(await drainStage(
      'validate',
      'pipeline-validate',
      ENTITY,
      targetTable,
      "ai_validation_status = 'pending'",
      500,
    ))
  )
    return;
  if (
    !(await drainStage(
      'dedup',
      'pipeline-deduplicate',
      ENTITY,
      targetTable,
      "ai_validation_status = 'approved' and dedup_status = 'pending'",
      500,
    ))
  )
    return;

  let total = 0;
  for (;;) {
    const res = await sql(`select count(*)::int as n from public.${commitFn}(200);`);
    const n = Number((res.result ?? res)[0].n);
    if (!n) break;
    total += n;
    console.log(`[drain] committed ${total}`);
  }
  console.log(`[drain] done — ${total} committed`);
}

// ---------------------------------------------------------------- main

const PHASES = {
  'fetch-dm': phaseFetchDm,
  'fetch-gaych': phaseFetchGaych,
  geocode: phaseGeocode,
  stage: phaseStage,
  drain: phaseDrain,
};
if (!PHASES[PHASE]) {
  console.error(`unknown --phase ${PHASE}; expected ${Object.keys(PHASES).join(', ')}`);
  process.exit(1);
}
await PHASES[PHASE]();
