#!/usr/bin/env node
/**
 * Import the filtered Planet Randy spot directory into `ingestion_staging`.
 *
 * The origin currently disallows crawling in robots.txt. A crawl therefore
 * requires the explicit `--acknowledge-robots-disallow` flag. See the approved
 * design in docs/plans/2026-10-05-planet-randy-spots-import-design.md.
 *
 * Usage:
 *   node scripts/data-quality/import-planet-randy.mjs --phase crawl --acknowledge-robots-disallow
 *   node scripts/data-quality/import-planet-randy.mjs --phase stage --dry-run
 *   node scripts/data-quality/import-planet-randy.mjs --phase stage
 *   node scripts/data-quality/import-planet-randy.mjs --phase drain
 *   node scripts/data-quality/import-planet-randy.mjs --phase report
 */

import { execFile, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  decodeHtml,
  countryCodeFromAddress,
  countryCodeForPoint,
  listingFromBrowserRow,
  parseDetailPage,
  parseLastPage,
  parseListingPage,
  toNormalizedVenue,
  validateRecord,
} from './lib/planet-randy-import-core.mjs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const SOURCE = 'planet-randy';
const BASE = 'https://planet-randy.com';
const DIRECTORY_PATH = '/blog/en/eintrag/';
const QUERY =
  'ls=&location=&listing_cat%5B0%5D=46&listing_cat%5B1%5D=29&listing_cat%5B2%5D=30&listing_cat%5B3%5D=28&orderby=&st=listing&lat=0&lng=0';
const OUT = join(process.cwd(), 'out-planet-randy');
const LIST_CACHE = join(OUT, 'cache', 'list');
const DETAIL_CACHE = join(OUT, 'cache', 'detail');
const COOKIE_JAR = join(OUT, 'session.cookies');
// The origin serves its public WordPress directory only to browser-shaped
// clients. The source and purpose still remain explicit in staging provenance.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1]?.startsWith('--') ? true : args[index + 1]) : fallback;
};
const has = (name) => args.includes(`--${name}`);
const PHASE = String(flag('phase', 'crawl'));
const DRY = has('dry-run');
const REFRESH = has('refresh');
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const DELAY_MS = Math.max(500, Number(flag('delay-ms', 1000)) || 1000);
const PORT = Number(flag('port', 43127));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const execFileAsync = promisify(execFile);

function readNdjson(path) {
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
}

function writeNdjson(path, rows) {
  writeFileSync(
    path,
    rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
  );
}

function tally(rows, value) {
  const result = {};
  for (const row of rows) result[value(row)] = (result[value(row)] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1]));
}

function listingUrl(page) {
  const path = page === 1 ? DIRECTORY_PATH : `${DIRECTORY_PATH}page/${page}/`;
  return `${BASE}${path}?${QUERY}`;
}

function detailCachePath(sourceId) {
  return join(DETAIL_CACHE, `${sourceId}.html`);
}

async function fetchText(url, { attempts = 6 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Cloudflare applies a substantially harsher challenge path to Node's
      // fetch TLS fingerprint than to the public browser/curl path. curl also
      // gives this one-off importer predictable redirect and HTTP-failure
      // behavior without changing how database requests are authenticated.
      const text = execFileSync(
        '/usr/bin/curl',
        [
          '--fail',
          '--location',
          '--silent',
          '--show-error',
          '--max-time',
          '45',
          '--user-agent',
          USER_AGENT,
          '--header',
          'Accept: text/html,application/xhtml+xml',
          '--cookie',
          COOKIE_JAR,
          '--cookie-jar',
          COOKIE_JAR,
          url,
        ],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
      );
      if (text.length < 1_000) throw new Error(`suspiciously short body (${text.length} bytes)`);
      return text;
    } catch (error) {
      const stderr = String(error.stderr || '');
      const message = /429/.test(stderr) ? 'HTTP 429' : error.message;
      lastError = new Error(message);
      if (attempt < attempts) {
        const adaptive = /HTTP 429/.test(message) ? 60_000 : DELAY_MS * attempt;
        const waitMs = adaptive;
        if (/HTTP 429/.test(message))
          console.warn(
            `[fetch] rate limited; retry ${attempt + 1}/${attempts} in ${Math.ceil(waitMs / 1_000)}s`,
          );
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function cachedFetch(path, url) {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  const html = await fetchText(url);
  writeFileSync(path, html);
  await sleep(DELAY_MS);
  return html;
}

async function phaseCrawl() {
  if (!has('acknowledge-robots-disallow')) {
    throw new Error(
      'Planet Randy robots.txt disallows crawling; rerun with --acknowledge-robots-disallow after explicit authorization',
    );
  }
  mkdirSync(LIST_CACHE, { recursive: true });
  mkdirSync(DETAIL_CACHE, { recursive: true });
  const first = await cachedFetch(join(LIST_CACHE, '1.html'), listingUrl(1));
  const lastPage = parseLastPage(first);
  if (lastPage < 2) throw new Error(`pagination discovery failed (last page ${lastPage})`);

  const seeds = new Map();
  const pageFailures = [];
  for (let page = 1; page <= lastPage; page++) {
    try {
      const html =
        page === 1 ? first : await cachedFetch(join(LIST_CACHE, `${page}.html`), listingUrl(page));
      const rows = parseListingPage(html);
      if (!rows.length) throw new Error('page contained no recognized listings');
      for (const row of rows) {
        const previous = seeds.get(row.source_id);
        seeds.set(row.source_id, previous ? { ...previous, ...row } : row);
      }
      if (page % 20 === 0 || page === lastPage)
        console.log(`[crawl:list] ${page}/${lastPage} pages, ${seeds.size} unique spots`);
    } catch (error) {
      pageFailures.push({ page, error: error.message });
      console.warn(`[crawl:list] page ${page}: ${error.message}`);
    }
  }
  const listings = [...seeds.values()].sort((a, b) => Number(a.source_id) - Number(b.source_id));
  writeNdjson(join(OUT, 'listings.ndjson'), listings);
  if (pageFailures.length) {
    writeFileSync(join(OUT, 'page-failures.json'), JSON.stringify(pageFailures, null, 2) + '\n');
    throw new Error(
      `${pageFailures.length} listing pages failed; refusing an incomplete detail crawl`,
    );
  }

  const recordsPath = join(OUT, 'records.ndjson');
  const records = new Map(readNdjson(recordsPath).map((row) => [row.source_id, row]));
  const pending = listings.filter((row) => !records.has(row.source_id));
  const todo = pending.slice(0, Number.isFinite(LIMIT) ? LIMIT : pending.length);
  const detailFailures = [];
  for (const [index, seed] of todo.entries()) {
    try {
      const html = await cachedFetch(detailCachePath(seed.source_id), seed.url);
      records.set(seed.source_id, parseDetailPage(html, seed));
    } catch (error) {
      detailFailures.push({ source_id: seed.source_id, url: seed.url, error: error.message });
      console.warn(`[crawl:detail] ${seed.source_id}: ${error.message}`);
    }
    if ((index + 1) % 50 === 0 || index + 1 === todo.length) {
      writeNdjson(
        recordsPath,
        [...records.values()].sort((a, b) => Number(a.source_id) - Number(b.source_id)),
      );
      console.log(
        `[crawl:detail] ${index + 1}/${todo.length}, parsed=${records.size}/${listings.length}, failed=${detailFailures.length}`,
      );
    }
  }
  writeFileSync(join(OUT, 'detail-failures.json'), JSON.stringify(detailFailures, null, 2) + '\n');
  console.log(
    `[crawl] complete: pages=${lastPage}, listings=${listings.length}, details=${records.size}, failures=${detailFailures.length}`,
  );
}

async function phaseCrawlRemainingDetails() {
  if (!has('acknowledge-robots-disallow')) {
    throw new Error(
      'Planet Randy robots.txt disallows crawling; rerun with --acknowledge-robots-disallow after explicit authorization',
    );
  }
  const listings = readNdjson(join(OUT, 'listings.ndjson'));
  if (listings.length !== 1422)
    throw new Error(`expected 1422 listing seeds, found ${listings.length}`);
  mkdirSync(DETAIL_CACHE, { recursive: true });
  const recordsPath = join(OUT, 'records.ndjson');
  const records = new Map(readNdjson(recordsPath).map((row) => [row.source_id, row]));
  const pending = listings.filter((seed) => {
    const status = records.get(seed.source_id)?.detail_status;
    return status !== 'parsed' && status !== 'no_structured_data';
  });
  const concurrency = Math.min(4, Math.max(1, Number(flag('concurrency', 2)) || 2));
  let cursor = 0;
  let completed = 0;
  let failures = 0;
  const persist = () =>
    writeNdjson(
      recordsPath,
      [...records.values()].sort((a, b) => Number(a.source_id) - Number(b.source_id)),
    );

  function detailUrlVariants(url) {
    const source = new URL(url);
    const translated = new URL(
      `${source.protocol}//planet--randy-com.translate.goog${source.pathname}`,
    );
    translated.searchParams.set('_x_tr_sl', 'auto');
    translated.searchParams.set('_x_tr_tl', 'en');
    translated.searchParams.set('_x_tr_hl', 'en');
    const localized = [
      url,
      url.replace('/blog/en/eintrag/', '/blog/eintrag/'),
      url.replace('/blog/en/eintrag/', '/blog/es/eintrag/'),
      url.replace('/blog/en/eintrag/', '/blog/fr/eintrag/'),
    ];
    return [
      translated.href,
      ...new Set(localized.flatMap((candidate) => [candidate, `${candidate}?amp=1`])),
    ];
  }

  async function fetchDetail(seed, workerIndex) {
    const path = detailCachePath(seed.source_id);
    if (existsSync(path)) return readFileSync(path, 'utf8');
    let lastError;
    const variants = detailUrlVariants(seed.url);
    for (let attempt = 1; attempt <= 8; attempt++) {
      const url =
        attempt === 1
          ? variants[0]
          : variants[1 + ((workerIndex + attempt - 2) % (variants.length - 1))];
      try {
        const { stdout } = await execFileAsync(
          '/usr/bin/curl',
          [
            '--fail',
            '--location',
            '--silent',
            '--show-error',
            '--max-time',
            '45',
            '--user-agent',
            USER_AGENT,
            '--header',
            'Accept: text/html,application/xhtml+xml',
            url,
          ],
          { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        );
        if (stdout.length < 1_000 || /<title>Just a moment/i.test(stdout))
          throw new Error(`challenge or short body (${stdout.length} bytes)`);
        writeFileSync(path, stdout);
        return stdout;
      } catch (error) {
        lastError = error;
        const rateLimited = /429|challenge/i.test(`${error.message}\n${error.stderr || ''}`);
        if (attempt < 8) {
          const completedVariantCycle = attempt % variants.length === 0;
          await sleep(rateLimited && completedVariantCycle ? 60_000 : 3_000 * attempt);
        }
      }
    }
    throw lastError;
  }

  async function worker(workerIndex) {
    for (;;) {
      const index = cursor++;
      if (index >= pending.length) return;
      const seed = pending[index];
      try {
        const html = await fetchDetail(seed, workerIndex);
        const existing = records.get(seed.source_id) || {};
        const parsed = parseDetailPage(html, seed);
        records.set(seed.source_id, {
          ...existing,
          ...parsed,
          address: parsed.address || existing.address || seed.address_display,
          country: parsed.country || existing.country,
        });
      } catch (error) {
        failures++;
        console.warn(`[crawl-details] ${seed.source_id}: ${error.message}`);
      }
      completed++;
      if (completed % 20 === 0 || completed === pending.length) {
        persist();
        console.log(
          `[crawl-details] attempted=${completed}/${pending.length}, enriched=${records.size - pending.length + completed - failures}/${listings.length}, failures=${failures}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
  persist();
  if (failures) throw new Error(`${failures} detail pages failed; rerun to resume`);
  console.log(`[crawl-details] complete=${listings.length}/${listings.length}`);
}

async function phaseReceiveBrowserExport() {
  mkdirSync(OUT, { recursive: true });
  const cached = new Map();
  for (let page = 1; page <= 143; page++) {
    const path = join(LIST_CACHE, `${page}.html`);
    if (!existsSync(path)) continue;
    for (const row of parseListingPage(readFileSync(path, 'utf8'))) cached.set(row.source_id, row);
  }

  await new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== '/archive') {
        response.writeHead(404).end('not found');
        return;
      }
      const chunks = [];
      let bytes = 0;
      request.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) request.destroy(new Error('payload too large'));
        else chunks.push(chunk);
      });
      request.on('error', reject);
      request.on('end', () => {
        try {
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!Array.isArray(input)) throw new Error('expected a JSON array');
          const invalid = [];
          for (const [index, item] of input.entries()) {
            const row = listingFromBrowserRow(item);
            if (!row) invalid.push(index);
            else cached.set(row.source_id, row);
          }
          if (invalid.length)
            throw new Error(`invalid browser rows at indexes ${invalid.join(',')}`);
          const listings = [...cached.values()].sort(
            (a, b) => Number(a.source_id) - Number(b.source_id),
          );
          if (listings.length !== 1422)
            throw new Error(`inventory mismatch: expected 1422, found ${listings.length}`);
          writeNdjson(join(OUT, 'listings.ndjson'), listings);
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({ received: input.length, cached: cached.size, total: listings.length }),
          );
          console.log(
            `[receive-browser-export] received=${input.length}, inventory=${listings.length}`,
          );
          server.close(resolve);
        } catch (error) {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: error.message }));
          server.close(() => reject(error));
        }
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () =>
      console.log(`[receive-browser-export] listening on http://127.0.0.1:${PORT}/archive`),
    );
  });
}

async function phaseBrowserDetailBridge() {
  const listings = readNdjson(join(OUT, 'listings.ndjson'));
  if (listings.length !== 1422)
    throw new Error(`expected 1422 listing seeds, found ${listings.length}`);
  const seeds = new Map(listings.map((row) => [row.source_id, row]));
  const recordsPath = join(OUT, 'records.ndjson');
  const records = new Map(readNdjson(recordsPath).map((row) => [row.source_id, row]));

  const persist = () =>
    writeNdjson(
      recordsPath,
      [...records.values()].sort((a, b) => Number(a.source_id) - Number(b.source_id)),
    );
  const detailsComplete = () =>
    listings.filter((row) => {
      const status = records.get(row.source_id)?.detail_status;
      return status === 'parsed' || status === 'no_structured_data';
    }).length;

  await new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url, `http://127.0.0.1:${PORT}`);
      if (request.method === 'GET' && requestUrl.pathname === '/pending') {
        const limit = Math.min(
          100,
          Math.max(1, Number(requestUrl.searchParams.get('limit')) || 25),
        );
        const pending = listings
          .filter((row) => {
            const status = records.get(row.source_id)?.detail_status;
            return status !== 'parsed' && status !== 'no_structured_data';
          })
          .slice(0, limit);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ total: listings.length, complete: detailsComplete(), pending }),
        );
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/details') {
        const chunks = [];
        let bytes = 0;
        request.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) request.destroy(new Error('payload too large'));
          else chunks.push(chunk);
        });
        request.on('error', reject);
        request.on('end', () => {
          try {
            const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!Array.isArray(input)) throw new Error('expected a JSON array');
            for (const item of input) {
              const seed = seeds.get(String(item.source_id || ''));
              if (!seed) throw new Error(`unknown source_id ${item.source_id}`);
              const scripts = Array.isArray(item.json_ld) ? item.json_ld : [];
              const website = String(item.website || '');
              const html = `${scripts
                .map((json) => `<script type="application/ld+json">${json}</script>`)
                .join('')}<li id="listing-website">${
                website ? `<a href="${website.replaceAll('"', '&quot;')}">website</a>` : ''
              }</li>`;
              const existing = records.get(seed.source_id) || {};
              const parsed = parseDetailPage(html, seed);
              records.set(seed.source_id, {
                ...existing,
                ...parsed,
                address: parsed.address || existing.address || seed.address_display,
                country: parsed.country || existing.country,
              });
            }
            persist();
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ received: input.length, complete: detailsComplete() }));
            console.log(
              `[browser-detail-bridge] received=${input.length}, complete=${detailsComplete()}`,
            );
          } catch (error) {
            response.writeHead(400, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ error: error.message }));
          }
        });
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/close') {
        persist();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ complete: detailsComplete(), total: listings.length }));
        server.close(resolve);
        return;
      }
      response.writeHead(404).end('not found');
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () =>
      console.log(
        `[browser-detail-bridge] listening on http://127.0.0.1:${PORT}; complete=${detailsComplete()}/${listings.length}`,
      ),
    );
  });
}

async function phaseEnrichGeospatial() {
  const listings = readNdjson(join(OUT, 'listings.ndjson'));
  if (listings.length !== 1422)
    throw new Error(`expected 1422 listing seeds, found ${listings.length}`);
  const boundariesPath = join(OUT, 'cache', 'ne_10m_admin_0_countries.geojson');
  if (!existsSync(boundariesPath))
    throw new Error(`missing Natural Earth country boundaries at ${boundariesPath}`);
  const boundaries = JSON.parse(readFileSync(boundariesPath, 'utf8'));
  const records = new Map(
    readNdjson(join(OUT, 'records.ndjson')).map((row) => [row.source_id, row]),
  );
  const unresolved = [];
  for (const seed of listings) {
    const existing = records.get(seed.source_id);
    if (existing?.country) continue;
    const country =
      countryCodeFromAddress(existing?.address || seed.address_display) ||
      countryCodeForPoint(boundaries, seed.lng, seed.lat);
    if (!country) {
      unresolved.push({ source_id: seed.source_id, name: seed.name, lat: seed.lat, lng: seed.lng });
      continue;
    }
    records.set(seed.source_id, {
      ...seed,
      ...(existing || {}),
      address: existing?.address || seed.address_display,
      country,
      schema_types: existing?.schema_types || [],
      detail_status: existing
        ? `${existing.detail_status || 'parsed'}_country_geocoded`
        : 'geocoded',
    });
  }
  const rows = [...records.values()].sort((a, b) => Number(a.source_id) - Number(b.source_id));
  writeNdjson(join(OUT, 'records.ndjson'), rows);
  writeFileSync(
    join(OUT, 'geospatial-unresolved.json'),
    JSON.stringify(unresolved, null, 2) + '\n',
  );
  console.log(
    `[enrich-geospatial] records=${rows.length}/${listings.length}, unresolved=${unresolved.length}, countries=${JSON.stringify(tally(rows, (row) => row.country || 'unknown'))}`,
  );
  if (unresolved.length)
    throw new Error(`${unresolved.length} coordinates did not resolve to a country`);
}

async function phaseRepairEntities() {
  let changed = 0;
  for (const filename of ['listings.ndjson', 'records.ndjson']) {
    const path = join(OUT, filename);
    const rows = readNdjson(path).map((row) => {
      const repaired = {
        ...row,
        name: decodeHtml(row.name),
        address_display: row.address_display
          ? decodeHtml(row.address_display)
          : row.address_display,
        address: row.address ? decodeHtml(row.address) : row.address,
        city: row.city ? decodeHtml(row.city) : row.city,
        state: row.state ? decodeHtml(row.state) : row.state,
      };
      if (JSON.stringify(repaired) !== JSON.stringify(row)) changed++;
      return repaired;
    });
    writeNdjson(path, rows);
  }
  console.log(`[repair-entities] changed_rows=${changed}`);
}

async function phaseRepairLinkedVenueNames() {
  const result = await sql(`
select distinct v.id,v.name from public.venue_sources s join public.venues v on v.id=s.venue_id
where s.source_slug='${SOURCE}' and v.duplicate_of_id is null
  and v.name ~ '&(amp|#[0-9]+|#x[0-9A-Fa-f]+);'
order by v.id;`);
  const rows = result.result || result || [];
  const repairs = rows
    .map((row) => ({ id: row.id, old_name: row.name, new_name: decodeHtml(row.name) }))
    .filter((row) => row.new_name !== row.old_name);
  if (!repairs.length) return console.log('[repair-linked-venue-names] changed=0');
  const payload = JSON.stringify(repairs);
  if (payload.includes('$PLANET_RANDY_NAMES$')) throw new Error('reserved SQL tag in name payload');
  const update = await sql(`
with desired as materialized (
  select * from jsonb_to_recordset($PLANET_RANDY_NAMES$${payload}$PLANET_RANDY_NAMES$::jsonb)
    as x(id uuid,old_name text,new_name text)
), changed as (
  update public.venues v set name=d.new_name,updated_at=now()
  from desired d where v.id=d.id and v.name=d.old_name returning v.id
)
select count(*)::int n from changed;`);
  const changed = Number((update.result || update || [])[0]?.n || 0);
  if (changed !== repairs.length)
    throw new Error(
      `venue-name compare-and-swap mismatch: expected ${repairs.length}, changed ${changed}`,
    );
  console.log(`[repair-linked-venue-names] changed=${changed}`);
}

async function phaseApproveSourceValidation() {
  const result = await sql(`
with eligible as materialized (
  select id from public.ingestion_staging
  where source_name='${SOURCE}' and target_table='venues' and disposition='pending'
    and ai_validation_status='needs_review'
    and coalesce(jsonb_array_length(ai_validation_result->'errors'),0)=0
    and ai_validation_result->'classification'->>'classified_as'='venue'
    and normalized_data->'metadata'->>'data_source'='${SOURCE}'
    and normalized_data->'location'->>'country' ~ '^[A-Z]{2}$'
    and nullif(normalized_data->'location'->>'lat','') is not null
    and nullif(normalized_data->'location'->>'lng','') is not null
), updated as (
  update public.ingestion_staging s set
    ai_validation_status='approved',review_status='auto',updated_at=now(),
    ai_validation_result=coalesce(s.ai_validation_result,'{}'::jsonb)||jsonb_build_object(
      'source_override','approved Planet Randy venue with stable source ID, coordinates, and ISO2 country'
    )
  from eligible e where s.id=e.id returning s.id
), resolved as (
  update public.review_queue q set status='resolved',resolved_at=now(),
    details=coalesce(q.details,'{}'::jsonb)||jsonb_build_object('resolution','trusted_source_validation')
  from updated u where q.entity_type='ingestion_staging' and q.entity_id=u.id and q.status='pending'
  returning q.entity_id
), events as (
  insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)
  select id,'validate','approved','planet-randy-import',jsonb_build_object(
    'reason','trusted_source_validation','guards',jsonb_build_array('no_validation_errors','classified_as_venue','has_coordinates','has_iso2_country')
  ) from updated returning staging_id
)
select count(*)::int n from updated;`);
  const approved = Number((result.result || result || [])[0]?.n || 0);
  console.log(`[approve-source-validation] approved=${approved}`);
}

async function phaseApproveReviewedMerges() {
  const reviewedIds = String(flag('source-ids', ''))
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
  if (!reviewedIds.length)
    throw new Error('approve-reviewed-merges requires --source-ids=id1,id2 after manual review');
  const idList = reviewedIds.map((id) => `'${id}'`).join(',');
  const eligibleCount = await scalar(`
select count(*)::int n from public.ingestion_staging s join public.venues v on v.id=s.dedup_match_id
where s.source_name='${SOURCE}' and s.target_table='venues' and s.disposition='pending'
  and s.source_entity_id in (${idList})
  and s.ai_validation_status='approved' and s.dedup_status='merge_candidate'
  and s.dedup_match_score>=.75
  and (
    public.haversine_m(
      (s.normalized_data->'location'->>'lat')::numeric,
      (s.normalized_data->'location'->>'lng')::numeric,v.latitude,v.longitude
    )<=150
    or lower(trim(s.normalized_data->>'name'))=lower(trim(v.name))
  );`);
  if (eligibleCount !== reviewedIds.length)
    throw new Error(
      `reviewed merge guard mismatch: expected ${reviewedIds.length}, found ${eligibleCount}`,
    );
  const result = await sql(`
with eligible as materialized (
  select s.id from public.ingestion_staging s join public.venues v on v.id=s.dedup_match_id
  where s.source_name='${SOURCE}' and s.target_table='venues' and s.disposition='pending'
    and s.source_entity_id in (${idList})
    and s.ai_validation_status='approved' and s.dedup_status='merge_candidate'
    and s.dedup_match_score>=.75
    and (
      public.haversine_m(
        (s.normalized_data->'location'->>'lat')::numeric,
        (s.normalized_data->'location'->>'lng')::numeric,v.latitude,v.longitude
      )<=150
      or lower(trim(s.normalized_data->>'name'))=lower(trim(v.name))
    )
), updated as (
  update public.ingestion_staging s set review_status='approved',reviewed_at=now(),
    review_notes='Planet Randy import: manually verified name/address/coordinate match',updated_at=now()
  from eligible e where s.id=e.id returning s.id,s.dedup_match_id
), resolved as (
  update public.review_queue q set status='resolved',resolved_at=now(),
    details=coalesce(q.details,'{}'::jsonb)||jsonb_build_object('resolution','verified_same_place')
  from updated u where q.entity_type='ingestion_staging' and q.entity_id=u.id and q.status='pending'
  returning q.entity_id
), events as (
  insert into public.ingestion_events(staging_id,venue_id,stage,new_status,actor,payload)
  select id,dedup_match_id,'review','approved','planet-randy-import',
    jsonb_build_object('reason','verified_same_place','max_distance_m',150,'min_score',.75)
  from updated returning staging_id
)
select count(*)::int n from updated;`);
  const approved = Number((result.result || result || [])[0]?.n || 0);
  console.log(`[approve-reviewed-merges] approved=${approved}`);
}

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql(query, attempt = 1) {
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      if ((response.status === 429 || response.status >= 500) && attempt < 5) {
        await sleep(2_000 * attempt);
        return sql(query, attempt + 1);
      }
      throw new Error(`management API ${response.status}: ${body}`);
    }
    return response.json();
  } catch (error) {
    if (attempt < 5 && !/^management API \d/.test(error.message)) {
      await sleep(2_000 * attempt);
      return sql(query, attempt + 1);
    }
    throw error;
  }
}

function normalizedCandidates() {
  const listings = readNdjson(join(OUT, 'listings.ndjson'));
  const records = readNdjson(join(OUT, 'records.ndjson'));
  if (!listings.length) throw new Error('missing listings.ndjson; run --phase crawl first');
  const recordById = new Map(records.map((row) => [row.source_id, row]));
  const merged = listings.map((seed) => recordById.get(seed.source_id) || seed);
  const invalid = merged
    .map((record) => ({ record, errors: validateRecord(record) }))
    .filter((item) => item.errors.length);
  const valid = merged.filter((record) => !validateRecord(record).length).map(toNormalizedVenue);
  return { listings, records, merged, invalid, valid };
}

async function phaseStage() {
  mkdirSync(OUT, { recursive: true });
  const { listings, records, merged, invalid, valid } = normalizedCandidates();
  const audit = {
    generated_at: new Date().toISOString(),
    source_listings: listings.length,
    detail_records: records.length,
    valid_candidates: valid.length,
    invalid_candidates: invalid.length,
    categories: tally(merged, (row) => row.category || 'unknown'),
    detail_statuses: tally(merged, (row) => row.detail_status || 'listing_only'),
    with_coordinates: merged.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
      .length,
    with_address: merged.filter((row) => row.address).length,
    with_country: merged.filter((row) => /^[A-Z]{2}$/.test(row.country || '')).length,
    with_official_website: merged.filter((row) => row.website).length,
    invalid_reasons: tally(
      invalid.flatMap((item) => item.errors.map((error) => ({ error }))),
      (row) => row.error,
    ),
  };
  writeFileSync(join(OUT, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
  writeFileSync(join(OUT, 'invalid.json'), JSON.stringify(invalid, null, 2) + '\n');
  writeFileSync(
    join(OUT, 'staged-preview.json'),
    JSON.stringify(valid.slice(0, 10), null, 2) + '\n',
  );
  console.log(JSON.stringify(audit, null, 2));
  if (invalid.length)
    throw new Error(`${invalid.length} invalid candidates; refusing a partial production stage`);
  if (valid.length !== listings.length)
    throw new Error(`inventory mismatch: ${valid.length}/${listings.length} candidates valid`);
  if (DRY) return console.log('[stage] DRY RUN — no database writes');

  let inserted = 0;
  let refreshed = 0;
  for (let offset = 0; offset < valid.length; offset += 100) {
    const chunk = valid.slice(offset, offset + 100);
    const payload = JSON.stringify(chunk);
    if (payload.includes('$PLANET_RANDY$'))
      throw new Error('payload contains reserved SQL dollar-quote tag');
    const result = await sql(`
with desired as materialized (
  select n,n->>'sourceId' source_id,encode(extensions.digest(n::text,'sha256'),'hex') desired_hash
  from jsonb_array_elements($PLANET_RANDY$${payload}$PLANET_RANDY$::jsonb) n
), latest as materialized (
  select distinct on (d.source_id) d.*,s.id,s.payload_hash
  from desired d left join public.ingestion_staging s
    on s.source_name='${SOURCE}' and s.target_table='venues' and s.source_entity_id=d.source_id
  order by d.source_id,s.updated_at desc nulls last,s.id desc nulls last
), refreshed as (
  update public.ingestion_staging s set
    normalized_data=l.n,raw_data=jsonb_build_object('source','${SOURCE}','url',l.n->'metadata'->>'url'),
    payload_hash=l.desired_hash,entity_type='venue',target_table='venues',source_type='${SOURCE}',
    disposition='pending',ai_validation_status='pending',dedup_status='pending',enrichment_status='pending',
    review_status='auto',error_message=null,processed_at=null,pipeline_run_id=null,node_id=null,updated_at=now()
  from latest l where s.id=l.id and s.payload_hash is distinct from l.desired_hash and ${REFRESH ? 'true' : 'false'}
  returning s.id
), inserted as (
  insert into public.ingestion_staging
    (raw_data,normalized_data,target_table,entity_type,source_type,source_name,source_entity_id,payload_hash,
     ai_validation_status,dedup_status,enrichment_status,review_status,disposition)
  select jsonb_build_object('source','${SOURCE}','url',l.n->'metadata'->>'url'),l.n,'venues','venue',
    '${SOURCE}','${SOURCE}',l.source_id,l.desired_hash,'pending','pending','pending','auto','pending'
  from latest l where l.id is null on conflict do nothing returning id
)
select (select count(*)::int from inserted) inserted,(select count(*)::int from refreshed) refreshed;`);
    const row = (result.result || result || [])[0] || {};
    inserted += Number(row.inserted || 0);
    refreshed += Number(row.refreshed || 0);
    console.log(
      `[stage] ${Math.min(offset + 100, valid.length)}/${valid.length}, inserted=${inserted}, refreshed=${refreshed}`,
    );
  }
}

async function projectAnonKey() {
  for (const name of [
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
  ]) {
    if (process.env[name]) return process.env[name];
  }
  for (const path of ['.env.production', '.env']) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const name of ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY']) {
      const value = new RegExp(`^${name}=(.+)$`, 'm')
        .exec(text)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, '');
      if (value) return value;
    }
  }
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`could not retrieve project API keys (${response.status})`);
  const keys = await response.json();
  const publishable = keys.find((item) => item.type === 'publishable' && item.name === 'default');
  const legacyAnon = keys.find((item) => item.type === 'legacy' && item.name === 'anon');
  const value = publishable?.api_key || legacyAnon?.api_key;
  if (!value) throw new Error('Supabase anonymous/publishable key is not configured');
  return value;
}

async function internalSecret() {
  const result = await sql(
    `select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret' limit 1`,
  );
  const secret = (result.result || result || [])[0]?.decrypted_secret;
  if (!secret) throw new Error('internal_invoke_secret is not configured');
  return secret;
}

async function invokePipeline(fn, secret, body) {
  const response = await fetch(`https://${PROJECT}.supabase.co/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await projectAnonKey()}`,
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${fn} HTTP ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function scalar(query) {
  const result = await sql(query);
  return Number((result.result || result || [])[0]?.n || 0);
}

async function dedupVenueBatch(runId, batchSize = 5000) {
  const result = await sql(`
with incoming as materialized (
  select s.id,s.pipeline_run_id,
    public.normalize_name(s.normalized_data->>'name') name_norm,
    public.dedup_despace(s.normalized_data->>'name') name_key,
    s.normalized_data->'location'->>'city' city,
    upper(s.normalized_data->'location'->>'country') country_code,
    nullif(s.normalized_data->'location'->>'lat','')::numeric lat,
    nullif(s.normalized_data->'location'->>'lng','')::numeric lng,
    public.normalize_address(s.normalized_data->'location'->>'address') address_norm
  from public.ingestion_staging s
  where s.source_name='${SOURCE}' and s.target_table='venues' and s.disposition='pending'
    and s.pipeline_run_id='${runId}'::uuid
    and s.ai_validation_status='approved' and s.dedup_status='pending'
  order by s.created_at,s.id limit ${batchSize} for update skip locked
), candidates as materialized (
  select i.id,v.id match_id,'address_exact'::text match_type,.97::numeric score,
    public.haversine_m(i.lat,i.lng,v.latitude,v.longitude) distance_m
  from incoming i join public.venues v
    on v.address_normalized=i.address_norm and public.dedup_despace(v.name)=i.name_key
  left join public.countries co on co.id=v.country_id
  where v.duplicate_of_id is null and (co.code is null or upper(co.code)=i.country_code)
  union all
  select i.id,v.id,'name_proximity',extensions.similarity(v.name_normalized,i.name_norm)::numeric,
    public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)
  from incoming i join public.venues v
    on v.latitude between i.lat-.003 and i.lat+.003
   and v.longitude between i.lng-.003 and i.lng+.003 and v.name_normalized % i.name_norm
  left join public.countries co on co.id=v.country_id
  where v.duplicate_of_id is null and (co.code is null or upper(co.code)=i.country_code)
    and public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)<=250
  union all
  select i.id,v.id,'despaced_city_text',.88::numeric,
    public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)
  from incoming i join public.venues v
    on public.dedup_despace(v.name)=i.name_key
   and public.dedup_despace(v.city)=public.dedup_despace(i.city)
  left join public.countries co on co.id=v.country_id
  where v.duplicate_of_id is null and (co.code is null or upper(co.code)=i.country_code)
    and (i.lat is null or v.latitude is null or public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)<=250)
), best as materialized (
  select distinct on(id) * from candidates order by id,score desc,distance_m asc nulls last
), classified as materialized (
  select i.*,
    case when coalesce(b.score,0)>=.90 then 'duplicate' when coalesce(b.score,0)>=.75 then 'merge_candidate' else 'unique' end decision,
    case when coalesce(b.score,0)>=.90 then 'auto_merge' when coalesce(b.score,0)>=.75 then 'flag_review' else 'no_match' end action,
    case when coalesce(b.score,0)>=.75 then b.match_id else null end match_id,
    coalesce(b.match_type,'none') match_type,coalesce(b.score,0) score,b.distance_m
  from incoming i left join best b using(id)
), audited as (
  insert into public.scraper_dedupe_decisions
    (entity_type,entity_a_id,entity_b_id,staging_id,pipeline_run_id,match_method,confidence,decision,action,rules_fired,decided_by)
  select 'venue',id,match_id,id,pipeline_run_id,match_type,score,decision,action,
    jsonb_build_object('signals',case when match_id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('match_type',match_type,'score',score)) end,
      'guards_fired','[]'::jsonb,'semantic_cosine',0),'pipeline-deduplicate'
  from classified returning staging_id
), updated as (
  update public.ingestion_staging s set
    dedup_status=a.decision,dedup_match_id=a.match_id,dedup_match_table='venues',dedup_match_score=a.score,
    dedup_details=coalesce(s.dedup_details,'{}'::jsonb)||jsonb_build_object('match_type',a.match_type,'fused_score',a.score,'semantic_cosine',0,'distance_m',a.distance_m),
    review_status=case when a.decision='merge_candidate' then 'pending_review' else 'auto' end,updated_at=now()
  from classified a join audited d on d.staging_id=a.id where s.id=a.id
  returning s.id,a.decision,a.match_id,a.match_type,a.score
), queued as (
  insert into public.review_queue(entity_type,entity_id,review_type,status,details)
  select 'ingestion_staging',u.id,'merge_candidate','pending',jsonb_build_object('target_table','venues','match_id',u.match_id,'match_type',u.match_type,'score',u.score)
  from updated u where u.decision='merge_candidate' returning entity_id
), events as (
  insert into public.ingestion_events(staging_id,venue_id,stage,new_status,actor,payload)
  select u.id,u.match_id,'deduplicate',u.decision,'pipeline-deduplicate',jsonb_build_object('target_table','venues','match_id',u.match_id,'match_score',u.score,'match_type',u.match_type)
  from updated u returning 1
)
select count(*)::int n from updated;`);
  return Number((result.result || result || [])[0]?.n || 0);
}

async function phaseDrain() {
  const runId = randomUUID();
  await sql(`
update public.pipeline_runs set status='failed',completed_at=now(),
 duration_ms=(extract(epoch from (now()-started_at))*1000)::int,
 error_message=coalesce(error_message,'superseded by a resumed Planet Randy drain')
where pipeline_name='planet-randy-production-import' and triggered_by='planet-randy-import'
  and status='running';
insert into public.pipeline_runs(id,pipeline_name,status,context,started_at,triggered_by)
values('${runId}'::uuid,'planet-randy-production-import','running',
 jsonb_build_object('source_name','${SOURCE}','target_table','venues'),now(),'planet-randy-import');
update public.ingestion_staging set pipeline_run_id='${runId}'::uuid,node_id='planet-randy-production-import',updated_at=now()
where source_name='${SOURCE}' and target_table='venues' and disposition='pending';`);
  const secret = await internalSecret();

  for (const stage of [
    { fn: 'pipeline-validate', predicate: "ai_validation_status='pending'", batchSize: 500 },
  ]) {
    let previous = -1;
    for (;;) {
      const pending = await scalar(
        `select count(*)::int n from public.ingestion_staging where source_name='${SOURCE}' and target_table='venues' and pipeline_run_id='${runId}'::uuid and disposition='pending' and ${stage.predicate}`,
      );
      if (!pending) break;
      if (pending === previous) throw new Error(`${stage.fn} stalled with ${pending} rows`);
      previous = pending;
      const result = await invokePipeline(stage.fn, secret, {
        pipeline_run_id: runId,
        entityType: 'venue',
        targetTable: 'venues',
        batch_size: stage.batchSize,
      });
      console.log(`[drain:${stage.fn}] pending=${pending}, result=${JSON.stringify(result)}`);
    }
  }

  for (;;) {
    const pending = await scalar(
      `select count(*)::int n from public.ingestion_staging where source_name='${SOURCE}' and target_table='venues' and pipeline_run_id='${runId}'::uuid and disposition='pending' and ai_validation_status='approved' and dedup_status='pending'`,
    );
    if (!pending) break;
    const progressed = await dedupVenueBatch(runId);
    if (!progressed) throw new Error(`database deduplication stalled with ${pending} rows`);
    console.log(`[drain:deduplicate] processed=${progressed}, remaining=${pending - progressed}`);
  }

  let committed = 0;
  for (;;) {
    const before = await scalar(
      `select count(*)::int n from public.ingestion_staging where source_name='${SOURCE}' and target_table='venues' and pipeline_run_id='${runId}'::uuid and disposition='pending' and ai_validation_status='approved' and dedup_status in ('unique','duplicate','merge_candidate') and review_status in ('auto','approved')`,
    );
    if (!before) break;
    await sql(`
do $planet_randy_commit$
declare r record; ignored record;
begin
  for r in select id from public.ingestion_staging
    where source_name='${SOURCE}' and target_table='venues' and pipeline_run_id='${runId}'::uuid
      and disposition='pending' and ai_validation_status='approved'
      and dedup_status in ('unique','duplicate','merge_candidate') and review_status in ('auto','approved')
    order by created_at limit 200 for update skip locked
  loop
    begin
      select * into ignored from public.commit_venue_staging_item(r.id,'planet-randy-import');
    exception when others then
      update public.ingestion_staging set disposition='rejected',error_message='commit_fn: '||sqlerrm,updated_at=now() where id=r.id;
      insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)
      values(r.id,'commit','rejected','planet-randy-import',jsonb_build_object('error',sqlerrm));
    end;
  end loop;
end
$planet_randy_commit$;`);
    const after = await scalar(
      `select count(*)::int n from public.ingestion_staging where source_name='${SOURCE}' and target_table='venues' and pipeline_run_id='${runId}'::uuid and disposition='pending' and ai_validation_status='approved' and dedup_status in ('unique','duplicate','merge_candidate') and review_status in ('auto','approved')`,
    );
    if (after >= before) throw new Error(`venue commit stalled with ${before} eligible rows`);
    committed += before - after;
    console.log(`[drain:commit] processed=${committed}, remaining=${after}`);
  }
  await sql(
    `update public.pipeline_runs set status='completed',completed_at=now(),duration_ms=(extract(epoch from (now()-started_at))*1000)::int where id='${runId}'::uuid`,
  );
  console.log(`[drain] complete run=${runId}`);
}

async function phaseReport() {
  const result = await sql(`
with canonical as materialized (
  select distinct on(source_entity_id) * from public.ingestion_staging
  where source_name='${SOURCE}' and target_table='venues'
  order by source_entity_id,updated_at desc,id desc
), linked as materialized (
  select venue_id,source_entity_id from public.venue_sources where source_slug='${SOURCE}'
)
select
 (select count(*)::int from canonical) inventory,
 (select count(*)::int from canonical where disposition in ('inserted','updated','committed')) committed,
 (select count(*)::int from canonical where disposition='rejected') rejected,
 (select count(*)::int from canonical where disposition='pending') pending,
 (select count(*)::int from canonical where review_status='pending_review') pending_review,
 (select count(*)::int from linked) source_links,
 (select count(distinct venue_id)::int from linked) distinct_venues,
 (select count(*)::int from linked l join public.venues v on v.id=l.venue_id where v.duplicate_of_id is null) live_links,
 (select count(*)::int from linked l join public.venues v on v.id=l.venue_id
   where v.name ~ '&(amp|#[0-9]+|#x[0-9A-Fa-f]+);') encoded_live_names,
 (select count(*)::int from canonical where error_message like 'commit_fn:%') commit_failures;`);
  const summary = (result.result || result || [])[0] || {};
  const statusResult = await sql(`
select ai_validation_status,dedup_status,review_status,disposition,count(*)::int n
from public.ingestion_staging
where source_name='${SOURCE}' and target_table='venues'
group by ai_validation_status,dedup_status,review_status,disposition
order by n desc;`);
  const sampleResult = await sql(`
select ai_validation_result,count(*)::int n
from public.ingestion_staging
where source_name='${SOURCE}' and target_table='venues' and disposition='pending'
group by ai_validation_result order by n desc limit 20;`);
  const statuses = statusResult.result || statusResult || [];
  const review_reasons = sampleResult.result || sampleResult || [];
  const mergeResult = await sql(`
select s.id staging_id,s.source_entity_id,
 s.normalized_data->>'name' source_name,s.normalized_data->'location'->>'address' source_address,
 (s.normalized_data->'location'->>'lat')::numeric source_lat,
 (s.normalized_data->'location'->>'lng')::numeric source_lng,
 s.dedup_match_score,s.dedup_details->>'match_type' match_type,
 v.id venue_id,v.name venue_name,v.address venue_address,v.latitude venue_lat,v.longitude venue_lng,
 public.haversine_m((s.normalized_data->'location'->>'lat')::numeric,
  (s.normalized_data->'location'->>'lng')::numeric,v.latitude,v.longitude)::int distance_m
from public.ingestion_staging s join public.venues v on v.id=s.dedup_match_id
where s.source_name='${SOURCE}' and s.target_table='venues' and s.disposition='pending'
  and s.dedup_status='merge_candidate'
order by s.dedup_match_score desc,s.source_entity_id;`);
  const merge_candidates = mergeResult.result || mergeResult || [];
  console.log(JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ statuses, review_reasons, merge_candidates }, null, 2));
  writeFileSync(
    join(OUT, 'production-report.json'),
    JSON.stringify(
      {
        ...summary,
        statuses,
        review_reasons,
        merge_candidates,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
}

const phases = {
  crawl: phaseCrawl,
  'crawl-remaining-details': phaseCrawlRemainingDetails,
  'browser-detail-bridge': phaseBrowserDetailBridge,
  'enrich-geospatial': phaseEnrichGeospatial,
  'repair-entities': phaseRepairEntities,
  'repair-linked-venue-names': phaseRepairLinkedVenueNames,
  'approve-source-validation': phaseApproveSourceValidation,
  'approve-reviewed-merges': phaseApproveReviewedMerges,
  'receive-browser-export': phaseReceiveBrowserExport,
  stage: phaseStage,
  drain: phaseDrain,
  report: phaseReport,
};
if (!phases[PHASE])
  throw new Error(`unknown --phase ${PHASE}; expected ${Object.keys(phases).join(', ')}`);
await phases[PHASE]();
