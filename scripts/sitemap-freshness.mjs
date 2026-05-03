#!/usr/bin/env node
// Sitemap freshness audit. Confirms each per-type sitemap returns 200, parses,
// has at least N entries, and that lastmod values are recent (within MAX_AGE_DAYS).
// Useful as a daily canary against stale or empty data-driven sitemaps.

const BASE = process.argv[2] ?? process.env.SITEMAP_BASE ?? 'https://queer.guide';
const SITEMAPS = [
  { path: '/sitemap.xml', minEntries: 5, kind: 'index' },
  { path: '/sitemap-static.xml', minEntries: 25, kind: 'urlset' },
  { path: '/sitemap-venues.xml', minEntries: 50, kind: 'urlset' },
  { path: '/sitemap-events.xml', minEntries: 5, kind: 'urlset' },
  { path: '/sitemap-news.xml', minEntries: 20, kind: 'urlset' },
  { path: '/sitemap-blog.xml', minEntries: 0, kind: 'urlset' },
  { path: '/sitemap-personalities.xml', minEntries: 5, kind: 'urlset' },
  { path: '/sitemap-places.xml', minEntries: 5, kind: 'urlset' },
  { path: '/sitemap-hotels.xml', minEntries: 0, kind: 'urlset' },
  { path: '/sitemap-villages.xml', minEntries: 0, kind: 'urlset' },
  { path: '/sitemap-tags.xml', minEntries: 0, kind: 'urlset' },
  { path: '/sitemap-landings.xml', minEntries: 5, kind: 'urlset' },
];

const MAX_AGE_DAYS = 14;

const fail = (m) => {
  console.error(`  X ${m}`);
  return 1;
};
const pass = (m) => {
  console.log(`  ok ${m}`);
  return 0;
};

const daysSince = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
};

async function audit({ path, minEntries, kind }) {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  console.log(`\n${path}`);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    return fail(`fetch failed: ${err.message}`);
  }
  if (res.status !== 200) return fail(`HTTP ${res.status}`);
  pass(`HTTP 200`);

  const xml = await res.text();
  const entryRe = kind === 'index' ? /<sitemap>/g : /<url>/g;
  const entries = (xml.match(entryRe) ?? []).length;
  if (entries < minEntries) return fail(`${entries} entries (expected ≥ ${minEntries})`);
  pass(`${entries} entries`);

  if (kind === 'urlset' && entries > 0) {
    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    if (lastmods.length === 0) return fail('no <lastmod> elements');
    const freshest = Math.min(...lastmods.map(daysSince));
    if (freshest > MAX_AGE_DAYS) {
      return fail(`freshest lastmod is ${freshest.toFixed(0)} days old (max ${MAX_AGE_DAYS})`);
    }
    pass(`freshest lastmod ${freshest.toFixed(0)}d ago`);
  }
  return 0;
}

async function main() {
  console.log(`Sitemap freshness against ${BASE}`);
  let failures = 0;
  for (const s of SITEMAPS) failures += await audit(s);
  console.log('');
  if (failures === 0) {
    console.log(`PASS - all ${SITEMAPS.length} sitemaps`);
    process.exit(0);
  } else {
    console.error(`FAIL - ${failures} failure(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
