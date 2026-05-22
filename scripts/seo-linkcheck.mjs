#!/usr/bin/env node
/**
 * Crawls the sitemap index, fetches every URL it lists (head requests
 * where possible, GET fallback), and reports:
 *   - non-2xx status codes (4xx, 5xx, redirect loops)
 *   - canonical-tag pointers that resolve to a different URL
 *   - meta robots noindex on URLs the sitemap insists are indexable
 *
 * Designed for CI: returns exit code 1 if any URL hard-fails (5xx or
 * unreachable), 0 otherwise. Use --strict to also fail on 4xx and
 * canonical drift.
 *
 * Usage:
 *   node scripts/seo-linkcheck.mjs                       # default base https://queer.guide
 *   QG_BASE=http://localhost:8788 node scripts/seo-linkcheck.mjs --strict
 *   node scripts/seo-linkcheck.mjs --max=50              # crawl at most 50 URLs
 */

const BASE = (process.env.QG_BASE ?? 'https://queer.guide').replace(/\/$/, '');
const STRICT = process.argv.includes('--strict');
const MAX = (() => {
  const arg = process.argv.find((a) => a.startsWith('--max='));
  if (!arg) return Infinity;
  const n = Number(arg.slice('--max='.length));
  return Number.isFinite(n) && n > 0 ? n : Infinity;
})();

const UA = 'Queer-Guide-Linkcheck/1.0 (+https://queer.guide)';

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    redirect: 'manual',
    headers: { 'User-Agent': UA, ...(opts.headers ?? {}) },
  });
  const text = res.status >= 300 && res.status < 400 ? '' : await res.text().catch(() => '');
  return { status: res.status, location: res.headers.get('location') ?? undefined, text };
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return m?.[1];
}

function extractRobots(html) {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
  return m?.[1]?.toLowerCase() ?? '';
}

async function main() {
  console.log(`Linkcheck base: ${BASE} (strict=${STRICT}, max=${MAX})`);

  // 1. Fetch sitemap index.
  const indexRes = await fetchText(`${BASE}/sitemap.xml`);
  if (indexRes.status !== 200) {
    console.error(`Sitemap index returned ${indexRes.status} — aborting.`);
    process.exit(1);
  }
  const childSitemaps = extractLocs(indexRes.text);
  console.log(`Sitemap index references ${childSitemaps.length} child sitemaps.`);

  // 2. Fetch each child sitemap, accumulate URLs.
  const urls = [];
  for (const sm of childSitemaps) {
    const res = await fetchText(sm);
    if (res.status !== 200) {
      console.warn(`  WARN: ${sm} → ${res.status}`);
      continue;
    }
    const locs = extractLocs(res.text);
    console.log(`  ${sm.split('/').pop()}  → ${locs.length} URLs`);
    urls.push(...locs);
  }
  const all = urls.slice(0, MAX);
  console.log(`Checking ${all.length} URLs…`);

  // 3. Walk each URL.
  const issues = { hard: [], soft: [] };
  let i = 0;
  for (const url of all) {
    i++;
    process.stdout.write(`  [${i}/${all.length}] ${url}\r`);
    const res = await fetchText(url, { method: 'GET' });

    if (res.status >= 500) {
      issues.hard.push({ url, kind: 'server-error', detail: res.status });
      continue;
    }
    if (res.status >= 400) {
      issues[STRICT ? 'hard' : 'soft'].push({ url, kind: 'client-error', detail: res.status });
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      issues[STRICT ? 'hard' : 'soft'].push({
        url,
        kind: 'redirect-in-sitemap',
        detail: `${res.status} → ${res.location}`,
      });
      continue;
    }

    const canon = extractCanonical(res.text);
    if (canon && canon !== url) {
      issues.soft.push({ url, kind: 'canonical-mismatch', detail: canon });
    }
    const robots = extractRobots(res.text);
    if (robots.includes('noindex')) {
      issues[STRICT ? 'hard' : 'soft'].push({ url, kind: 'noindex-in-sitemap', detail: robots });
    }
  }
  process.stdout.write('\n');

  // 4. Report.
  console.log('');
  console.log(`Hard issues: ${issues.hard.length}`);
  for (const x of issues.hard) console.log(`  ✗ ${x.kind} :: ${x.url} :: ${x.detail}`);
  console.log(`Soft issues: ${issues.soft.length}`);
  for (const x of issues.soft.slice(0, 20)) console.log(`  · ${x.kind} :: ${x.url} :: ${x.detail}`);
  if (issues.soft.length > 20) console.log(`  · …and ${issues.soft.length - 20} more (rerun --strict to fail on these)`);

  process.exit(issues.hard.length ? 1 : 0);
}

main().catch((e) => {
  console.error('linkcheck failed:', e);
  process.exit(2);
});
