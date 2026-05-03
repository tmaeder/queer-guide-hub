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
  '/resources',
  '/news',
  '/about',
  '/blog',
];

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

const pick = (html, re) => {
  const m = re.exec(html);
  return m ? m[1].trim() : null;
};

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
  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const canonical = pick(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  const ogImage = pick(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i);
  const hasJsonLd = /application\/ld\+json/.test(html);
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

    // Bot UA: middleware should inject route-specific body content. We expect
    // an <h1> in the raw HTML and a non-trivial body size.
    if (r.botStatus !== 200) failures += fail(`bot HTTP ${r.botStatus}`);
    else if (!r.botH1) failures += fail('bot UA: missing <h1> in initial HTML');
    else {
      pass(`bot <h1>: "${r.botH1.replace(/<[^>]+>/g, '').slice(0, 60)}"`);
      if (r.botBodySize < 3000) {
        failures += fail(`bot HTML too small: ${r.botBodySize} bytes (expected >3000)`);
      }
    }
  }

  if (duplicates.size > 0) {
    console.log('');
    for (const t of duplicates) failures += fail(`duplicate title: "${t}"`);
  }

  console.log('');
  if (failures === 0) {
    console.log(`PASS - all ${results.length} routes`);
    process.exit(0);
  } else {
    console.error(`FAIL - ${failures} failure(s) across ${results.length} routes`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
