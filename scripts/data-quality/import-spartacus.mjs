#!/usr/bin/env node
/**
 * Import Spartacus going-out venues + saunas into ingestion_staging.
 *
 * Source of truth is spartacus.gayguide.travel (NOT spartacus.world — that host
 * answers 200 with a 114-byte empty body, which is why the pre-existing
 * `source-spartacus` edge function has never produced a single row).
 *
 * Two-phase crawl, both disk-cached so re-runs cost nothing:
 *
 *   --phase list    one request per (vertical, country). The country listing page
 *                   embeds `var markers = [[lat,lng,"<icon>.png","<name>","<a href=…>"]]`
 *                   for EVERY venue in that country, so coordinates, category and
 *                   the stable numeric id all come from ~190 requests total.
 *   --phase detail  one request per venue for address / phone / hours / full
 *                   description / amenity codes.
 *   --phase stage   emit rows into ingestion_staging.
 *
 * IDENTITY: `source_entity_id` is the BARE NUMERIC id parsed out of the detail
 * URL (`/goingout/malta/malta-valletta/2063_Tom+Bar` -> "2063"). This is
 * deliberate and load-bearing — the good 2026-04-15 import cohort (1,469 rows,
 * 77% coords, 3.6% duplicate rate) used exactly this key, so commit matches it
 * via venue_sources(source_slug='spartacus', source_entity_id) and takes the
 * UPDATE branch. The 2026-04-26 cohort used `spartacus:<name-slug>:<city>` and
 * duplicated 47% of itself; do not reintroduce that scheme.
 *
 * Usage:
 *   node scripts/data-quality/import-spartacus.mjs --phase list
 *   node scripts/data-quality/import-spartacus.mjs --phase detail [--limit N]
 *   node scripts/data-quality/import-spartacus.mjs --phase stage --dry-run
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const BASE = 'https://spartacus.gayguide.travel';
const OUT = join(process.cwd(), 'out-spartacus');
const CACHE = join(OUT, 'cache');

const VERTICALS = [
  { slug: 'goingout', path: 'goingout' },
  { slug: 'saunas', path: 'saunas' },
];

// Politeness. The whole corpus is ~6k pages; there is no reason to hammer.
const DELAY_MS = 700;
const RETRIES = 3;

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);
const PHASE = flag('phase', 'list');
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const DRY = has('dry-run');
// --refresh also rewrites the payload of venues staged by an EARLIER import,
// which plain INSERT ... ON CONFLICT DO NOTHING silently leaves stale.
const REFRESH = has('refresh');
// --country "Malta,Iceland" restricts the sweep; used for smoke-testing the
// parsers without paying for a full 190-request crawl.
const ONLY = flag('country')
  ? String(flag('country'))
      .split(',')
      .map((s) => s.trim().toLowerCase())
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      // A short body on this host means an error page, not an empty result set.
      if (html.length < 500) throw new Error(`suspiciously short body (${html.length}B)`);
      writeFileSync(p, html);
      await sleep(DELAY_MS);
      return html;
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await sleep(DELAY_MS * attempt * 3);
    }
  }
  throw new Error(`${key}: ${lastErr.message}`);
}

// ---------------------------------------------------------------- parsing

/** Country <option value=id>Name</option> pairs from a vertical's search form. */
function parseCountries(html) {
  const sel = /<select[^>]*name="countries_id"[\s\S]*?<\/select>/i.exec(html);
  if (!sel) throw new Error('countries_id select not found');
  const out = [];
  for (const m of sel[0].matchAll(/<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)) {
    const id = m[1].trim();
    const name = decodeEntities(stripTags(m[2])).trim();
    if (id && name) out.push({ id, name });
  }
  return out;
}

/**
 * The marker array double-encodes: Spartacus takes the UTF-8 bytes of a name and
 * JSON-escapes each BYTE as its own codepoint, so "Bravó" ships as
 * "BravÃ³" and JSON.parse faithfully returns "Bravó". Reverse it by
 * re-reading the codepoints as latin-1 bytes and decoding those as UTF-8.
 * Detail pages are clean UTF-8 and must NOT be run through this.
 */
function fixMojibake(s) {
  if (typeof s !== 'string' || !/[ÃÂÐÑ][-¿]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    return fixed.includes('�') ? s : fixed;
  } catch {
    return s;
  }
}

const NAMED_ENTITIES = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  uuml: 'ü',
  auml: 'ä',
  ouml: 'ö',
  szlig: 'ß',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  ntilde: 'ñ',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
};

/**
 * Decode HTML entities in a SINGLE pass.
 *
 * Chaining `.replace()` calls double-unescapes: resolving `&amp;` -> `&`
 * first turns `&amp;lt;` into `&lt;`, which a later replace turns into a
 * literal `<`, so source text that deliberately escaped a tag comes back out
 * as markup. One regex over all entity forms cannot do that, because scanning
 * resumes AFTER each match instead of re-reading what it just produced.
 */
function decodeEntities(s) {
  return String(s).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, body) => {
    if (body[0] === '#') {
      const cp =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return full;
      try {
        return String.fromCodePoint(cp);
      } catch {
        return full;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? full;
  });
}

/**
 * Strip markup to plain text.
 *
 * Removing complete `<...>` tags is idempotent on its own — the pattern
 * always consumes the leading `<`, so a removal cannot splice a new tag into
 * existence — but it leaves an UNTERMINATED tag untouched, because there is
 * no closing `>` to match: `Bar <script src=evil` passes through with
 * `<script` intact. Dropping a dangling `<...` at end-of-input closes that.
 * This text becomes venues.name / venues.description, which
 * functions/_lib/detail.ts re-renders into the crawler JSON-LD.
 */
function stripTags(html) {
  let s = String(html);
  let prev;
  do {
    prev = s;
    s = s.replace(/<[^>]*>/g, '');
  } while (s !== prev);
  return s.replace(/<[^>]*$/, '');
}

/**
 * The Leaflet marker array on a country listing page.
 * Shape: [lat, lng, "<icon>marker.png", "<name>", "<popup html with detail link>"]
 */
function parseMarkers(html) {
  const m = /var\s+markers\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!m) return [];
  let arr;
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const out = [];
  for (const row of arr) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [lat, lng, icon, name, popup] = row;
    const href = /href=\\?"([^"\\]+)\\?"/.exec(popup) || /href="([^"]+)"/.exec(popup);
    if (!href) continue;
    const url = href[1].replace(/\\\//g, '/');
    const parsed = parseDetailUrl(url);
    if (!parsed) continue;
    out.push({
      id: parsed.id,
      url,
      name: fixMojibake(decodeEntities(String(name))),
      country_slug: parsed.country,
      region_slug: parsed.region,
      city_slug: parsed.city,
      lat: Number(lat),
      lng: Number(lng),
      marker: String(icon || '')
        .replace(/marker\.png$/, '')
        .replace(/\.png$/, ''),
    });
  }
  return out;
}

/**
 * Detail URLs have a VARIABLE number of geo segments — countries with a
 * province/state tier insert an extra one:
 *
 *   /goingout/malta/malta-valletta/2063_Tom+Bar              (country/city)
 *   /goingout/canada/quebec/montreal/65079_1000+Grammes      (country/region/city)
 *
 * Pinning this to exactly two geo segments silently drops every federal
 * country — Canada parsed to 0 of its 93 venues before this was fixed, and
 * the USA (the single biggest country in the corpus) would have gone the
 * same way. Match the trailing `<id>_<name>` and treat everything before it
 * as the geo path: first segment is the country, last is the city.
 */
function parseDetailUrl(url) {
  const m = /\/(goingout|saunas)\/(.+?)\/(\d+)_[^/]*$/.exec(url);
  if (!m) return null;
  const segs = m[2].split('/').filter(Boolean);
  if (!segs.length) return null;
  return {
    vertical: m[1],
    country: segs[0],
    region: segs.length > 2 ? segs.slice(1, -1).join('/') : null,
    city: segs[segs.length - 1],
    id: m[3],
  };
}

/**
 * Tag-strip to plain text, replacing tags with a space so adjacent inline
 * elements do not fuse into one word. Loops for the same reason as stripTags:
 * one pass leaves `<script>` behind on `<scr<script>ipt>`.
 */
const strip = (h) => {
  let s = String(h);
  let prev;
  do {
    prev = s;
    s = s.replace(/<[^>]*>/g, ' ');
  } while (s !== prev);
  s = s.replace(/<[^>]*$/, ' '); // unterminated trailing tag — see stripTags
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
};

/**
 * Full record from a venue detail page. The markup is stable and classed, so
 * every field is targeted rather than guessed:
 *
 *   <h2 class="navigation"><a>Country</a> » <a>City</a> » <em>Name</em></h2>
 *   <div class="entry ...">
 *     <h1>Cafes - <a>Cafe Babalú</a></h1>
 *     <p>Light meals are offered for low Prices.</p>     <- description
 *     <div class="details"><ul><li>amenity code label</li></ul></div>
 *     <p class="address">Skólavördustig 22a | Reykjavík</p>
 *     <p class="address">+354552 2278</p>
 *     <p class="address"><a href="http://www.babalu.is">www.babalu.is</a></p>
 *
 * NOTE: the <title> is NOT usable — it omits the country for some countries
 * ("Bravó - Reykjavik - Spartacus Gay Map") and embeds " - " inside the city
 * for others ("Tom Bar - Malta - Malta - Valletta - ..."), so splitting it
 * silently yields a city of "Spartacus Gay Map".
 */
function parseDetail(html, seed) {
  const rec = { ...seed };

  // Breadcrumb — the authoritative country/city/name.
  const nav = /<h2[^>]*class="[^"]*navigation[^"]*"[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  if (nav) {
    const links = [...nav[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => strip(m[1]));
    if (links[0]) rec.country = links[0];
    if (links[1]) rec.city = links[1];
    const em = /<em[^>]*>([\s\S]*?)<\/em>/i.exec(nav[1]);
    if (em) rec.name = strip(em[1]);
  }

  const entry =
    /<div[^>]*class="entry[^"]*"[^>]*>([\s\S]*?)(?:<div[^>]*class="hotelLeft|<h2>\s*Address)/i.exec(
      html,
    );
  const entryHtml = entry ? entry[1] : '';

  // "<h1>Cafes - <a>Cafe Babalú</a></h1>" -> category label is everything
  // before the final " - ", which is outside the anchor.
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) {
    const before = h1[1].split(/<a[\s>]/i)[0];
    const label = strip(before)
      .replace(/[-–—\s]+$/, '')
      .trim();
    if (label) rec.category_label = label;
    if (!rec.name) rec.name = strip(h1[1]).replace(/^.*?-\s*/, '');
  }

  // Amenity codes: <div class="details"><ul><li>…</li></ul></div>
  const details = /<div[^>]*class="[^"]*details[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (details) {
    const codes = [...details[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
      .map((m) => strip(m[1]))
      .filter(Boolean);
    if (codes.length) rec.codes = [...new Set(codes)];
  }

  // Description: the first bare <p> in the entry block, excluding p.address
  // and excluding anything that merely restates an amenity code label.
  const codeSet = new Set(rec.codes || []);
  for (const m of entryHtml.matchAll(/<p(?![^>]*class=)[^>]*>([\s\S]*?)<\/p>/g)) {
    const t = strip(m[1]);
    if (t.length > 15 && !codeSet.has(t) && !/^open:/i.test(t)) {
      rec.description = t;
      break;
    }
  }

  // `p.address` is overloaded — the SAME class carries four different things,
  // in this order: opening hours, "street | city", phone, website anchor.
  // Discriminate by content, never by position.
  for (const m of html.matchAll(/<p[^>]*class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\/p>/g)) {
    const rawP = m[1];
    const t = strip(rawP);

    if (/^open:/i.test(t)) {
      if (!rec.hours_text) rec.hours_text = t.replace(/^open:\s*/i, '').trim();
      continue;
    }

    const href = /<a[^>]*href="([^"]+)"/i.exec(rawP);
    if (href) {
      // href is frequently the literal string "http://" with no host at all.
      const u = href[1].trim();
      if (!rec.website && /^https?:\/\/[^/\s.]+\.[^/\s]/i.test(u)) rec.website = u;
      continue;
    }

    if (/^[+(]?[0-9][0-9\s\-()/.+]{6,}$/.test(t)) {
      if (!rec.phone) rec.phone = t;
      continue;
    }

    if (!rec.address && t) {
      // "Skólavördustig 22a   | Reykjavík" -> street, city
      const [street, city] = t.split('|').map((s) => s.trim());
      if (street) rec.address = street;
      if (city && !rec.city_detail) rec.city_detail = city;
    }
  }

  return rec;
}

// ---------------------------------------------------------------- category mapping

/**
 * Spartacus marker icon / category label -> venues_category_check vocabulary.
 * Allowed: bar club cafe restaurant hotel sauna cruising outdoor shop
 *          community_center organization event-venue theater gallery salon gym toilet other
 * A row that lands on an invalid value is REJECTED at commit, so this map must
 * be total — unknowns fall through to 'other', never to 'unknown'.
 */
const CATEGORY_MAP = {
  // Marker-icon stems (singular) AND human category labels (plural) both land
  // here, so every term needs both spellings — the map is keyed after
  // lowercasing and stripping non-letters.
  bar: 'bar',
  bars: 'bar',
  club: 'club',
  clubs: 'club',
  danceclubs: 'club',
  cafe: 'cafe',
  cafes: 'cafe',
  restaurant: 'restaurant',
  restaurants: 'restaurant',
  hotel: 'hotel',
  hotels: 'hotel',
  shop: 'shop',
  saunas: 'sauna',
  sauna: 'sauna',
  cruising: 'cruising',
  cruisingareas: 'cruising',
  sexshops: 'shop',
  shops: 'shop',
  shopping: 'shop',
  fetish: 'shop',
  bookshops: 'shop',
  groups: 'community_center',
  organisations: 'organization',
  organizations: 'organization',
  health: 'organization',
  beaches: 'outdoor',
  beach: 'outdoor',
  parks: 'outdoor',
  outdoor: 'outdoor',
  theaters: 'theater',
  cinemas: 'theater',
  galleries: 'gallery',
  fitnessstudios: 'gym',
  fitness: 'gym',
  gyms: 'gym',
  escorts: 'other',
  services: 'other',
  travel: 'other',
  travelandtransport: 'other',
  generalinfo: 'other',
  cruisingclubs: 'cruising',
  darkrooms: 'cruising',
  apartments: 'hotel',
  guesthouses: 'hotel',
};

function mapCategory(rec) {
  const keys = [rec.marker, rec.category_label].filter(Boolean).map((s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z]/g, ''),
  );
  for (const k of keys) {
    if (CATEGORY_MAP[k]) return CATEGORY_MAP[k];
  }
  if (rec.vertical === 'saunas') return 'sauna';
  return 'other';
}

// ---------------------------------------------------------------- country codes

/**
 * `venues.country` is CHECK-constrained to an ISO-2 code
 * (`venues_country_iso2_check`), and `commit_venue_staging_item` writes
 * `normalized_data.location.country` into it verbatim. Passing the display
 * name — which is what Spartacus gives — fails the constraint and the row is
 * rejected at commit with disposition='rejected'. Note this is NOT caught by
 * the country_id resolution, which happily matches on name; only the text
 * column is constrained.
 *
 * 117 of Spartacus's 122 country labels resolve against `countries.name`
 * either directly or after dropping a "Region - " prefix
 * ("Caribbean - Cuba", "China - Hong Kong"). These five do not, and one of
 * them is the single largest country in the corpus.
 */
const COUNTRY_OVERRIDES = {
  usa: 'US', // 1,135 venues — the biggest country in the corpus
  'korea-south': 'KR',
  reunion: 'RE', // countries.name is "Réunion"
  'caribbean - bonaire': 'BQ', // countries.name is "Caribbean Netherlands"
  // Spartacus lumps the Dutch and French halves of one island into a single
  // label. SX (Sint Maarten) is the larger, and carries the venues.
  'caribbean - st. maarten/st. martin': 'SX',
};

async function buildCountryIso() {
  const res = await sql(`select code, name from countries where code is not null`);
  const rows = res.result ?? res;
  const byName = new Map();
  for (const r of rows) byName.set(String(r.name).toLowerCase(), String(r.code).toUpperCase());

  return (label) => {
    const k = String(label || '')
      .toLowerCase()
      .trim();
    if (COUNTRY_OVERRIDES[k]) return COUNTRY_OVERRIDES[k];
    if (byName.has(k)) return byName.get(k);
    // "Caribbean - Cuba" -> "Cuba", "China - Hong Kong" -> "Hong Kong"
    const stripped = k.replace(/^.*?\s-\s/, '');
    if (byName.has(stripped)) return byName.get(stripped);
    return null;
  };
}

// ---------------------------------------------------------------- phases

async function phaseList() {
  mkdirSync(CACHE, { recursive: true });
  const all = [];
  const catalog = {};

  for (const v of VERTICALS) {
    const searchHtml = await getCached(`${v.slug}__search`, `${BASE}/${v.path}/search/`);
    const countries = parseCountries(searchHtml);
    catalog[v.slug] = countries.length;
    console.log(`[list] ${v.slug}: ${countries.length} countries`);

    for (const c of countries) {
      if (ONLY && !ONLY.includes(c.name.toLowerCase())) continue;
      const url = `${BASE}/${v.path}/search/?s=true&search_name=&countries_id=${c.id}&cities_id=`;
      let html;
      try {
        html = await getCached(`${v.slug}__c${c.id}`, url);
      } catch (e) {
        console.warn(`  ! ${v.slug}/${c.name}: ${e.message}`);
        continue;
      }
      const markers = parseMarkers(html);
      for (const m of markers)
        all.push({ ...m, vertical: v.slug, country_name: c.name, country_id: c.id });
      console.log(`  ${v.slug}/${c.name} (${c.id}): ${markers.length}`);
    }
  }

  // A venue can legitimately appear in both verticals (a sauna that is also a
  // club). Keep the sauna reading — it is the more specific claim.
  const byId = new Map();
  for (const r of all) {
    const prev = byId.get(r.id);
    if (!prev || (r.vertical === 'saunas' && prev.vertical !== 'saunas')) byId.set(r.id, r);
  }
  const rows = [...byId.values()];

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'listings.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n'));
  console.log(`\n[list] ${all.length} markers -> ${rows.length} unique ids`);
  console.log(
    `[list] by vertical:`,
    tally(rows, (r) => r.vertical),
  );
  console.log(
    `[list] by marker:`,
    tally(rows, (r) => r.marker),
  );
  console.log(`[list] wrote ${join(OUT, 'listings.ndjson')}`);
}

function tally(rows, fn) {
  const t = {};
  for (const r of rows) t[fn(r)] = (t[fn(r)] || 0) + 1;
  return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]));
}

async function phaseDetail() {
  const seeds = readNdjson(join(OUT, 'listings.ndjson'));
  const todo = seeds.slice(0, LIMIT === Infinity ? seeds.length : LIMIT);
  const out = [];
  let ok = 0;
  let fail = 0;

  for (const [i, seed] of todo.entries()) {
    try {
      const html = await getCached(`detail__${seed.id}`, seed.url);
      out.push(parseDetail(html, seed));
      ok++;
    } catch (e) {
      fail++;
      console.warn(`  ! ${seed.id} ${seed.name}: ${e.message}`);
    }
    if ((i + 1) % 100 === 0)
      console.log(`[detail] ${i + 1}/${todo.length} (ok=${ok} fail=${fail})`);
  }

  writeFileSync(join(OUT, 'records.ndjson'), out.map((r) => JSON.stringify(r)).join('\n'));
  console.log(`\n[detail] ok=${ok} fail=${fail} -> ${join(OUT, 'records.ndjson')}`);
  console.log(`[detail] with address:`, out.filter((r) => r.address).length);
  console.log(`[detail] with phone:`, out.filter((r) => r.phone).length);
  console.log(`[detail] with description:`, out.filter((r) => r.description).length);
}

function readNdjson(p) {
  if (!existsSync(p)) throw new Error(`missing ${p} — run an earlier --phase first`);
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** "california" -> "California", "new-south-wales" -> "New South Wales" */
function titleCase(slug) {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Build the exact normalized_data payload commit_venue_staging_item consumes. */
function toNormalized(rec, isoFor) {
  const category = mapCategory(rec);
  const tags = ['queer-friendly'];
  if (category === 'sauna') tags.push('sauna');

  const iso = isoFor(rec.country_name);
  if (!iso)
    throw new Error(`unresolved country "${rec.country_name}" (venue ${rec.id} ${rec.name})`);

  return {
    entityType: 'venue',
    sourceId: rec.id,
    sourceName: 'spartacus',
    name: rec.name,
    description: rec.description || undefined,
    category,
    location: {
      address: rec.address || undefined,
      // Passed through VERBATIM. Spartacus metro labels are inconsistent —
      // "Malta - Valletta" is region-city while "Birmingham - West Midlands"
      // is city-region, so any split rule is wrong half the time. Every row
      // carries coordinates, so let the existing coordinate-driven linkers
      // (geo-link-content / backfill-venue-cities) resolve city_id instead of
      // guessing here. See CLAUDE.md on same-name city collisions.
      city: rec.city_detail || rec.city || undefined,
      // MUST be ISO-2 — see COUNTRY_OVERRIDES. The display name fails
      // venues_country_iso2_check and the row is rejected at commit.
      country: iso,
      // Federal countries put the province/state in the URL, so this fills
      // venues.state for free on the 1,631 rows that have it.
      state: rec.region_slug ? titleCase(rec.region_slug) : undefined,
      lat: Number.isFinite(rec.lat) ? rec.lat : undefined,
      lng: Number.isFinite(rec.lng) ? rec.lng : undefined,
    },
    contacts: {
      phone: rec.phone || undefined,
      website: rec.website || undefined,
    },
    tags,
    metadata: {
      data_source: 'spartacus',
      url: rec.url,
      id: rec.id,
      vertical: rec.vertical,
      marker: rec.marker,
      category_label: rec.category_label || null,
      hours_text: rec.hours_text || null,
      codes: rec.codes || [],
      country_slug: rec.country_slug,
      region_slug: rec.region_slug || null,
      city_slug: rec.city_slug,
      city_breadcrumb: rec.city || null,
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

/**
 * Management-API query with retry.
 *
 * A drain makes hundreds of calls over ~20 minutes, so a single transient
 * network blip must not kill the run — one `getaddrinfo ENOTFOUND` on
 * api.supabase.com did exactly that mid-drain. Retries cover transport
 * errors and 5xx/429; a 4xx is a real query error and fails immediately,
 * because retrying a malformed statement just delays the report.
 */
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
    // Transport-level failure (DNS, reset, timeout) — no HTTP status at all.
    if (e instanceof Error && !/^mgmt API \d/.test(e.message) && attempt < MAX_ATTEMPTS) {
      console.warn(`[sql] ${e.message}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

async function phaseStage() {
  const recs = readNdjson(join(OUT, 'records.ndjson'));
  const isoFor = await buildCountryIso();

  // Resolve countries BEFORE writing anything: an unresolved label is a
  // guaranteed commit rejection, and finding that out after 5,783 inserts is
  // strictly worse than finding it out now.
  const unresolved = [...new Set(recs.map((r) => r.country_name).filter((n) => !isoFor(n)))];
  if (unresolved.length) {
    throw new Error(`unresolved countries (add to COUNTRY_OVERRIDES): ${unresolved.join(', ')}`);
  }

  const rows = recs.filter((r) => r.name && r.name.trim()).map((r) => toNormalized(r, isoFor));

  console.log(`[stage] ${rows.length} rows`);
  console.log(
    `[stage] category mix:`,
    tally(rows, (r) => r.category),
  );
  console.log(`[stage] with coords:`, rows.filter((r) => r.location.lat != null).length);
  console.log(`[stage] with address:`, rows.filter((r) => r.location.address).length);

  if (DRY) {
    writeFileSync(join(OUT, 'staged-preview.json'), JSON.stringify(rows.slice(0, 5), null, 2));
    console.log(`[stage] DRY RUN — sample written to ${join(OUT, 'staged-preview.json')}`);
    return;
  }

  // 100 rows/statement: the disk-constrained DB plus the per-row venue triggers
  // make bigger batches a false economy.
  //
  // INSERT is a no-op for anything already staged. The idempotency trigger
  // derives idempotency_key from sha1(source_name || ':' || source_entity_id),
  // which is constant per venue, so ux_ingestion_staging_source_idem makes
  // ON CONFLICT DO NOTHING skip it — that is what keeps a re-run safe, but it
  // also means a venue staged by an EARLIER import keeps that older, thinner
  // payload forever. `--refresh` is the second statement that fixes this: it
  // rewrites normalized_data in place and re-opens the row to 'pending' when
  // the payload actually changed, mirroring the source-adapter `refresh` path.
  // Commit's UPDATE branch is coalesce(existing, new), so re-committing fills
  // nulls without clobbering curated values.
  const CHUNK = 100;
  let done = 0;
  let refreshed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const payload = JSON.stringify(chunk);
    // The payload is interpolated into a $J$-quoted literal; a literal "$J$"
    // inside it would terminate the quote early and corrupt the statement.
    if (payload.includes('$J$')) throw new Error(`chunk ${i} contains the dollar-quote tag $J$`);
    const q = `
insert into public.ingestion_staging
  (raw_data, normalized_data, target_table, entity_type, source_type, source_name,
   source_entity_id, payload_hash,
   ai_validation_status, dedup_status, enrichment_status, review_status, disposition)
select
  jsonb_build_object('source','spartacus','url', n->'metadata'->>'url'),
  n, 'venues', 'venue', 'spartacus', 'spartacus',
  n->>'sourceId',
  encode(extensions.digest(n::text,'sha256'),'hex'),
  'pending','pending','pending','auto','pending'
from jsonb_array_elements($J$${payload}$J$::jsonb) as n
on conflict do nothing;`;
    await sql(q);

    if (REFRESH) {
      const r = await sql(`
update public.ingestion_staging s
set normalized_data = n,
    raw_data = jsonb_build_object('source','spartacus','url', n->'metadata'->>'url'),
    payload_hash = encode(extensions.digest(n::text,'sha256'),'hex'),
    -- Load-bearing: rows staged before entity_type existed carry NULL, and
    -- pipeline-validate selects with .eq('entity_type','venue'), so a
    -- re-opened row would be invisible to the validator and sit at 'pending'
    -- forever. Re-opening a row means restoring every field the stages
    -- select on, not just the payload.
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
from jsonb_array_elements($J$${payload}$J$::jsonb) as n
where s.source_name = 'spartacus'
  and s.source_entity_id = n->>'sourceId'
  and s.payload_hash is distinct from encode(extensions.digest(n::text,'sha256'),'hex')
returning 1;`);
      refreshed += (r.result ?? r ?? []).length;
    }

    done += chunk.length;
    console.log(`[stage] ${done}/${rows.length}${REFRESH ? ` (refreshed ${refreshed})` : ''}`);
  }
  console.log(`[stage] done`);
}

// ---------------------------------------------------------------- drain

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

/**
 * Fire one pipeline stage via pg_net so the internal-invoke secret is read
 * from the vault inside the database and never leaves it.
 *
 * These calls MUST be serialised. The stage functions select their work with
 * a plain `.eq(status,'pending')` + limit and no FOR UPDATE SKIP LOCKED, so
 * concurrent invocations all grab the SAME rows: measured, six parallel
 * validate calls advanced 500 rows, exactly what one call does.
 */
async function firePipelineStage(fn, batchSize) {
  await sql(`
select net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/${fn}',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ${ANON_KEY}',
    'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
  ),
  body := '{"entityType":"venue","batch_size":${batchSize}}'::jsonb,
  timeout_milliseconds := 150000
);`);
}

/**
 * Count rows a stage can ACTUALLY act on — its own selector, not just
 * "status is pending".
 *
 * pipeline-deduplicate additionally requires ai_validation_status='approved',
 * so the rows validate parked as 'needs_review' are permanently invisible to
 * it, by design: they are waiting on a human. Counting them as pending work
 * makes a finished drain look stalled — measured, it halted at exactly the 64
 * needs_review rows and never reached the commit step.
 */
async function countActionable(predicate) {
  const res = await sql(`
select count(*)::int as n from public.ingestion_staging
where source_name='spartacus' and target_table='venues'
  and disposition = 'pending' and ${predicate};`);
  const rows = res.result ?? res;
  return Number(rows[0].n);
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
      // No forward progress. One retry covers a slow response landing late;
      // a second identical reading means the stage is parking rows in a
      // status this loop does not count, and spinning would be an infinite
      // loop rather than a wait.
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
  const okValidate = await drainStage(
    'validate',
    'pipeline-validate',
    "ai_validation_status = 'pending'",
    500,
  );
  if (!okValidate) return;
  const okDedup = await drainStage(
    'dedup',
    'pipeline-deduplicate',
    "ai_validation_status = 'approved' and dedup_status = 'pending'",
    500,
  );
  if (!okDedup) return;

  // Commit is pure SQL, so it runs synchronously in-statement. 200/batch keeps
  // each statement well inside the API timeout while the per-row venue
  // triggers fire.
  let total = 0;
  for (;;) {
    const res = await sql(`select count(*)::int as n from public.commit_venue_staging_batch(200);`);
    const n = Number((res.result ?? res)[0].n);
    if (!n) break;
    total += n;
    console.log(`[drain] committed ${total}`);
  }
  console.log(`[drain] done — ${total} committed`);
}

// ---------------------------------------------------------------- main

const PHASES = { list: phaseList, detail: phaseDetail, stage: phaseStage, drain: phaseDrain };
if (!PHASES[PHASE]) {
  console.error(`unknown --phase ${PHASE}; expected one of ${Object.keys(PHASES).join(', ')}`);
  process.exit(1);
}
await PHASES[PHASE]();
