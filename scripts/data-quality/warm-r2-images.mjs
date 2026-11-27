#!/usr/bin/env node
// Copy every external content image into R2, ahead of anyone viewing it.
//
// The site already serves every external image through the image-cdn
// pull-through (`img.queer.guide/r/<base64url(source)>`, see
// workers/image-cdn/src/remote.ts), which copies a source into R2 on its first
// request. This script makes that first request for every image the database
// references, so nothing depends on a source staying online until someone
// happens to look. It sends HEAD: on a miss the worker fetches and stores the
// image and returns no body; on a hit it answers from R2 at once — so a re-run
// only pays for what is still missing.
//
// It writes NOTHING to the database. Rows keep their original URL as the
// record of where an image came from; render-time rewriting maps it to the R2
// copy deterministically (src/utils/imageHost.ts `toR2ImageUrl`, imported
// below so the encoding cannot drift from the client's).
//
// Usage (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//   node scripts/data-quality/warm-r2-images.mjs [--only news,events] [--limit 500] [--concurrency 48]
//     [--per-host 6] [--failed-out warm-r2-failed.json]
//
// Requests are spread round-robin across hosts and capped per host, so one
// big CDN (cdn.shopify.com is ~250k of the images) never rate-limits the run.
// Every failure is written to --failed-out with the worker's X-Mirror-Reason.

import { toR2ImageUrl } from '../../src/utils/imageHost.ts';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const ONLY = arg('only', '')?.split(',').filter(Boolean);
const LIMIT = Number(arg('limit', 0)) || Infinity;
const CONCURRENCY = Number(arg('concurrency', 48));
const PER_HOST = Number(arg('per-host', 6));
const FAILED_OUT = arg('failed-out', 'warm-r2-failed.json');

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}

// Every column the site renders an image from. `filter` is PostgREST syntax.
const SOURCES = [
  { name: 'news', table: 'news_articles', cols: ['image_url'], filter: 'duplicate_of_id=is.null' },
  { name: 'marketplace', table: 'marketplace_listings', cols: ['images'], filter: 'duplicate_of_id=is.null&status=eq.active' },
  { name: 'events', table: 'events', cols: ['images', 'logo_url'], filter: 'duplicate_of_id=is.null' },
  { name: 'venues', table: 'venues', cols: ['images', 'logo_url'], filter: 'duplicate_of_id=is.null' },
  { name: 'personalities', table: 'personalities', cols: ['image_url'] },
  { name: 'hotels', table: 'hotels', cols: ['images'] },
  { name: 'cities', table: 'cities', cols: ['image_url', 'curated_image_url'], filter: 'duplicate_of_id=is.null' },
  { name: 'countries', table: 'countries', cols: ['image_url', 'curated_image_url'] },
  { name: 'villages', table: 'queer_villages', cols: ['image_url', 'images'] },
  { name: 'tags', table: 'unified_tags', cols: ['image_url'], filter: 'status=eq.active' },
  { name: 'milestones', table: 'milestones', cols: ['image_url'] },
  { name: 'brands', table: 'marketplace_brands', cols: ['logo_url'] },
  { name: 'organizations', table: 'organizations', cols: ['logo_url', 'cover_image_url', 'images'] },
];

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function* rows(src) {
  let last = null;
  for (;;) {
    const q = [`select=id,${src.cols.join(',')}`, 'order=id', 'limit=1000'];
    if (src.filter) q.push(src.filter);
    if (last) q.push(`id=gt.${last}`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${src.table}?${q.join('&')}`, { headers });
    if (!res.ok) throw new Error(`${src.table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    if (page.length === 0) return;
    yield* page;
    last = page[page.length - 1].id;
  }
}

// source URL -> R2 pull-through URL, deduplicated across every table.
const work = new Map();
for (const src of SOURCES) {
  if (ONLY?.length && !ONLY.includes(src.name)) continue;
  let n = 0;
  for await (const row of rows(src)) {
    for (const col of src.cols) {
      const v = row[col];
      for (const url of Array.isArray(v) ? v : [v]) {
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
        const r2 = toR2ImageUrl(url);
        if (r2 === url || !r2.includes('/r/')) continue; // already on R2, private, or direct
        if (!work.has(url)) { work.set(url, { r2, source: src.name }); n++; }
      }
    }
  }
  console.log(`${src.name}: ${n} new external image URLs`);
}
// Round-robin across hosts so concurrent requests are spread out.
const byHost = new Map();
for (const entry of work) {
  const host = new URL(entry[0]).host;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(entry);
}
const interleaved = [];
for (let i = 0, added = true; added; i++) {
  added = false;
  for (const list of byHost.values()) if (i < list.length) { interleaved.push(list[i]); added = true; }
}
const items = interleaved.slice(0, LIMIT);
console.log(`\n${items.length} distinct external images to warm (concurrency ${CONCURRENCY})\n`);

const tally = { hit: 0, miss: 0, failed: 0 };
const failedByHost = new Map();
const failures = [];
const inflight = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let done = 0;
const started = Date.now();

async function warm([url, { r2, source }]) {
  const host = new URL(url).host;
  while ((inflight.get(host) ?? 0) >= PER_HOST) await sleep(25);
  inflight.set(host, (inflight.get(host) ?? 0) + 1);
  let outcome = 'failed';
  let reason = 'network';
  try {
    for (let attempt = 0; attempt < 2 && outcome === 'failed'; attempt++) {
      try {
        const res = await fetch(r2, { method: 'HEAD', signal: AbortSignal.timeout(45_000) });
        if (res.ok) outcome = res.headers.get('x-mirror') === 'hit' ? 'hit' : 'miss';
        else {
          reason = res.headers.get('x-mirror-reason') ?? `http-${res.status}`;
          if (res.status === 404) break; // the worker already decided
        }
      } catch {
        reason = 'client-timeout'; // one retry
      }
    }
  } finally {
    inflight.set(host, inflight.get(host) - 1);
  }
  tally[outcome]++;
  if (outcome === 'failed') {
    failedByHost.set(host, (failedByHost.get(host) ?? 0) + 1);
    failures.push({ url, host, source, reason });
  }
  if (++done % 2000 === 0) {
    const rate = done / ((Date.now() - started) / 1000);
    console.log(`${done}/${items.length}  hit ${tally.hit}  copied ${tally.miss}  failed ${tally.failed}  (${rate.toFixed(1)}/s)`);
  }
}

let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) await warm(items[next++]);
  }),
);

const ok = tally.hit + tally.miss;
console.log(`\nDone in ${Math.round((Date.now() - started) / 60000)} min`);
console.log(`In R2: ${ok}/${items.length} (${((100 * ok) / Math.max(items.length, 1)).toFixed(1)}%) — already ${tally.hit}, copied now ${tally.miss}`);
console.log(`Not copyable (source gone, blocked, or not an image): ${tally.failed}`);
const byReason = new Map();
for (const f of failures) {
  const k = `${f.host}\t${f.reason.replace(/^cached:/, '')}`;
  byReason.set(k, (byReason.get(k) ?? 0) + 1);
}
console.log('Top failures (host, reason):');
for (const [k, n] of [...byReason].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n}\t${k}`);
const { writeFileSync } = await import('node:fs');
writeFileSync(FAILED_OUT, JSON.stringify(failures, null, 1));
console.log(`\nAll ${failures.length} failures written to ${FAILED_OUT}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### R2 image warm\n\n| | count |\n|---|---|\n| distinct external images | ${items.length} |\n| already in R2 | ${tally.hit} |\n| copied this run | ${tally.miss} |\n| not copyable | ${tally.failed} |\n`,
  );
}
