#!/usr/bin/env node
// SEO regression check. Hits a sample of routes against a base URL and asserts:
//   - HTTP 200
//   - <title> exists, unique across the sample, length 30..60
//   - <meta name="description"> exists, length 70..160
//   - <link rel="canonical"> exists and matches the requested URL (path-wise)
//   - og:image is absolute (starts with https://)
//   - JSON-LD on the homepage parses
//
// Usage: node scripts/seo-check.mjs https://queer.guide
//        node scripts/seo-check.mjs https://<preview>.pages.dev
//
// Exits 0 on pass, 1 on any failure.

const BASE = process.argv[2] ?? process.env.SEO_CHECK_BASE ?? 'https://queer.guide';
const ROUTES = [
  '/',
  '/venues',
  '/events',
  '/marketplace',
  '/hotels',
  '/travel',
  '/map',
  '/personalities',
  '/tags',
  '/news',
  '/about',
  '/blog',
  // Intent Router landing pages. Safe to sample: each is indexable and carries
  // its own STATIC_ROUTE_META + STATIC_ROUTE_BODY entry, so it gets a real bot
  // body. A NOINDEX route must never be added here — functions/_middleware.ts
  // gates the crawler body on `indexable`, so the botH1 / botBodySize
  // assertions below would fail on it by construction.
  '/going-out',
  '/rights',
  '/support',
  // No '/shop': it 301s to /marketplace (already sampled above). A redirect
  // source cannot be sampled here at all — fetch follows redirects, so the
  // response would carry the /marketplace canonical against a /shop request
  // and the canonical-match assertion would fail by construction.
];

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

// Detail pages are sampled from the live sitemaps rather than listed here, so
// this can never pin a slug that later 404s. One URL per type; the FIRST <loc>
// in each sitemap, so the sample is deterministic and CI stays stable.
//
// Until 2026-09-10 this script checked ONLY the static routes above — 15 URLs
// out of the 61,718 the sitemaps publish, i.e. no coverage at all of the entire
// detail surface where essentially all of the content lives.
const DETAIL_SITEMAPS = [
  'sitemap-venues.xml',
  'sitemap-news.xml',
  'sitemap-tags.xml',
  'sitemap-personalities.xml',
  'sitemap-events.xml',
  'sitemap-places.xml',
  'sitemap-hotels.xml',
  'sitemap-milestones.xml',
];

// Detail titles are NOT held to TITLE_MIN. A short entity name is legitimate —
// "Eunuch | Queer Guide" is 20 chars and correct for that tag — so applying the
// hub bound here would fail by construction on real pages. The upper bound is
// still enforced, because a truncated title is a real defect either way.
const DETAIL_TITLE_MAX = 60;
const DETAIL_DESC_MAX = 160;

// scripts/sitemap-freshness.mjs defaults to pages.dev because Cloudflare bot
// management blocks GitHub Actions egress (datacenter ASN) on the custom domain.
// This script runs green against queer.guide today, so BASE is tried first and
// the mirror is a fallback — but discovery FAILS THE RUN if both are
// unreachable rather than skipping. A detail check that can silently sample
// nothing is precisely the vacuous guard this change exists to remove.
const MIRROR_BASE = 'https://queer-guide.pages.dev';

const pick = (html, re) => {
  const m = re.exec(html);
  return m ? m[1].trim() : null;
};

// Title/description bounds must be measured on the RENDERED text, not on the raw
// attribute. `functions/_lib/detail.ts` truncates to MAX_DESC and only then
// HTML-escapes, so every `"` becomes `&quot;` and adds 5 raw characters — a
// description that is a correct 153 rendered chars can read as 163 raw. The
// first version of the detail check measured raw and reported
// /city/salinas-us-fre8j as over-length; it is not, and "fixing" the truncation
// would have shortened correct descriptions to satisfy a broken ruler.
//
// Note DOMParser is NOT a Node global, so htmlToText() below silently falls
// through to its angle-bracket fallback under CI and never decodes anything.
// This does the decoding explicitly instead.
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

const decodeEntities = (s) =>
  String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = NAMED_ENTITIES[name.toLowerCase()];
      return v === undefined ? m : v;
    })
    // &amp;quot; style double-encoding resolves on the second pass.
    .replace(/&amp;/g, '&');

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

async function check(path) {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  const [humanRes, botRes] = await Promise.all([
    fetch(url, { headers: { 'User-Agent': 'queer-guide-seo-check/1' } }),
    fetch(url, { headers: { 'User-Agent': BOT_UA } }),
  ]);
  const html = await humanRes.text();
  const botHtml = await botRes.text();
  const rawTitle = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = rawTitle === null ? null : decodeEntities(rawTitle);
  // Backreference on the opening quote so apostrophes inside double-quoted
  // content don't truncate the match (e.g. "who's behind it").
  const descMatch = /<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1/i.exec(html);
  const description = descMatch ? decodeEntities(descMatch[2].trim()) : null;
  const canonical = pick(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  const ogImage = pick(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i);
  const hasJsonLd = /application\/ld\+json/.test(html);
  const hreflangs = (html.match(/<link\s+rel=["']alternate["']\s+hreflang=/gi) ?? []).length;
  const botH1 = pick(botHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const botBodySize = botHtml.length;
  return {
    path,
    url,
    status: humanRes.status,
    botStatus: botRes.status,
    title,
    description,
    canonical,
    ogImage,
    hasJsonLd,
    hreflangs,
    botH1,
    botBodySize,
  };
}

const fail = (msg, ctx) => {
  console.error(`  X ${msg}${ctx ? ` (${ctx})` : ''}`);
  return 1;
};
const pass = (msg) => {
  console.log(`  ok ${msg}`);
  return 0;
};

// Returns the PATH of the first <loc> in a sitemap, not the absolute URL: the
// generators hardcode ORIGIN as queer.guide, so a preview/mirror run must
// re-point the path at its own BASE or it would silently audit production.
async function firstLocPath(base, file) {
  const res = await fetch(`${base.replace(/\/$/, '')}/${file}`, {
    headers: { 'User-Agent': 'queer-guide-seo-check/1' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const m = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(xml);
  if (!m) return null; // valid but empty sitemap — not an error here
  try {
    return new URL(m[1]).pathname;
  } catch {
    return null;
  }
}

async function discoverDetailRoutes() {
  for (const origin of [BASE, MIRROR_BASE]) {
    const found = [];
    let reachable = true;
    for (const file of DETAIL_SITEMAPS) {
      try {
        const p = await firstLocPath(origin, file);
        if (p) found.push({ file, path: p });
      } catch {
        reachable = false;
        break;
      }
    }
    if (reachable) {
      if (origin !== BASE) console.log(`  (detail slugs discovered via ${origin})`);
      return found;
    }
  }
  return null; // both origins unreachable — caller fails the run
}

function checkDetail(r) {
  let failures = 0;
  console.log(`\n${r.path}  [detail]`);

  if (r.status !== 200) return fail(`HTTP ${r.status}`, r.url);
  pass(`HTTP 200`);

  if (!r.title) failures += fail('missing <title>');
  else if (r.title.length > DETAIL_TITLE_MAX)
    failures += fail(`title ${r.title.length} chars (max ${DETAIL_TITLE_MAX}): "${r.title}"`);
  else pass(`title (${r.title.length}): "${r.title}"`);

  if (!r.description) failures += fail('missing <meta name="description">');
  else if (r.description.length > DETAIL_DESC_MAX)
    failures += fail(`description ${r.description.length} chars (max ${DETAIL_DESC_MAX})`);
  else pass(`description (${r.description.length})`);

  if (!r.canonical) failures += fail('missing <link rel="canonical">');
  else {
    const canonPath = (() => {
      try {
        return new URL(r.canonical).pathname;
      } catch {
        return r.canonical;
      }
    })();
    if (canonPath !== r.path) failures += fail(`canonical path "${canonPath}" != "${r.path}"`);
    else pass(`canonical: ${r.canonical}`);
  }

  // A detail page with no structured data is the whole reason the middleware
  // reads the row at all — if this regresses, the per-type JSON-LD builder in
  // functions/_lib/detail.ts stopped resolving.
  if (!r.hasJsonLd) failures += fail('missing JSON-LD');
  else pass('JSON-LD present');

  if (r.botStatus !== 200) failures += fail(`bot HTTP ${r.botStatus}`);
  else if (!r.botH1) failures += fail('bot UA: missing <h1> in initial HTML');
  else pass(`bot <h1>: "${r.botH1}"`);

  return failures;
}

async function main() {
  console.log(`SEO check against ${BASE}\n`);
  const results = [];
  for (const path of ROUTES) {
    try {
      results.push(await check(path));
    } catch (err) {
      console.error(`  X ${path} - fetch failed: ${err.message}`);
      results.push({ path, status: 0, error: err.message });
    }
  }

  let failures = 0;
  const titles = new Set();
  const duplicates = new Set();

  for (const r of results) {
    console.log(`\n${r.path}`);
    if (r.status !== 200) {
      failures += fail(`HTTP ${r.status}`, r.url);
      continue;
    }
    pass(`HTTP 200`);

    if (!r.title) failures += fail('missing <title>');
    else {
      pass(`title: "${r.title}" (${r.title.length} chars)`);
      if (r.title.length < TITLE_MIN || r.title.length > TITLE_MAX) {
        failures += fail(`title length out of bounds [${TITLE_MIN}..${TITLE_MAX}]`);
      }
      if (titles.has(r.title)) duplicates.add(r.title);
      titles.add(r.title);
    }

    if (!r.description) failures += fail('missing <meta name="description">');
    else {
      pass(`description: ${r.description.length} chars`);
      if (r.description.length < DESC_MIN || r.description.length > DESC_MAX) {
        failures += fail(`description length out of bounds [${DESC_MIN}..${DESC_MAX}]`);
      }
    }

    if (!r.canonical) failures += fail('missing <link rel="canonical">');
    else {
      const canonPath = new URL(r.canonical).pathname.replace(/\/$/, '') || '/';
      const wantPath = r.path.replace(/\/$/, '') || '/';
      if (canonPath !== wantPath) failures += fail(`canonical path "${canonPath}" != "${wantPath}"`);
      else pass(`canonical: ${r.canonical}`);
    }

    if (!r.ogImage) failures += fail('missing og:image');
    else if (!/^https:\/\//.test(r.ogImage)) failures += fail(`og:image not absolute: ${r.ogImage}`);
    else pass(`og:image: ${r.ogImage}`);

    if (r.path === '/' && !r.hasJsonLd) failures += fail('homepage missing JSON-LD');
    else if (r.path === '/') pass('JSON-LD present');

    // hreflang: expect 11 supported locales + 1 x-default = 12 alternates.
    if (r.hreflangs < 12) failures += fail(`hreflang alternates: ${r.hreflangs} (expected ≥ 12)`);
    else pass(`hreflang: ${r.hreflangs} alternates`);

    // Bot UA: middleware should inject route-specific body content. We expect
    // an <h1> in the raw HTML and a non-trivial body size.
    if (r.botStatus !== 200) failures += fail(`bot HTTP ${r.botStatus}`);
    else if (!r.botH1) failures += fail('bot UA: missing <h1> in initial HTML');
    else {
      pass(`bot <h1>: "${htmlToText(r.botH1).slice(0, 60)}"`);
      if (r.botBodySize < 3000) {
        failures += fail(`bot HTML too small: ${r.botBodySize} bytes (expected >3000)`);
      }
    }
  }

  if (duplicates.size > 0) {
    console.log('');
    for (const t of duplicates) failures += fail(`duplicate title: "${t}"`);
  }

  // ---- Detail-page sample -------------------------------------------------
  // Kept in its own pass with its own assertions: detail titles are shorter than
  // the hub bounds allow (see DETAIL_TITLE_MAX) and detail pages carry no
  // og:image requirement, so folding them into the loop above would produce
  // failures that are correct by the hub rules and wrong by the detail rules.
  console.log('\n--- detail pages (sampled from live sitemaps) ---');
  let sampledDetail = 0;
  const detailRoutes = await discoverDetailRoutes();

  if (detailRoutes === null) {
    console.log('');
    failures += fail(
      `could not reach the sitemaps on ${BASE} or ${MIRROR_BASE} to discover detail routes`,
    );
  } else if (detailRoutes.length === 0) {
    console.log('');
    failures += fail('sitemaps reachable but published no detail URLs to sample');
  } else {
    const detailResults = [];
    for (const { path } of detailRoutes) {
      try {
        detailResults.push(await check(path));
      } catch (err) {
        console.error(`  X ${path} - fetch failed: ${err.message}`);
        failures += 1;
      }
    }
    for (const r of detailResults) failures += checkDetail(r);
    console.log(`\n  sampled ${detailResults.length} detail routes`);
    sampledDetail = detailResults.length;
  }

  // Report both counts. Saying "all 15 routes" while a second pass also ran is
  // how a check comes to look narrower (or wider) than it is.
  const total = results.length + sampledDetail;
  console.log('');
  if (failures === 0) {
    console.log(`PASS - ${results.length} static + ${sampledDetail} detail = ${total} routes`);
    process.exit(0);
  } else {
    console.error(
      `FAIL - ${failures} failure(s) across ${results.length} static + ${sampledDetail} detail routes`,
    );
    process.exit(1);
  }
}

function htmlToText(input) {
  const source = String(input ?? '');
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    return doc.body?.textContent ?? '';
  } catch {
    // Fallback: remove angle brackets to avoid tag-like content in output.
    return source.replace(/[<>]/g, '');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
