#!/usr/bin/env node
/**
 * One-time, consent-gated crawl of gays-cruising.com's approved cruising zones.
 *
 * The origin challenges non-browser HTTP clients, so this uses the project's
 * Playwright dependency. It warms the sitemap and API paths with real browser
 * navigations, then performs bounded same-origin fetches in that browser
 * session. Output is resumable and gitignored.
 *
 * Only factual fields are persisted. The API's user-authored `descripcion`
 * field is deliberately discarded.
 *
 * Usage:
 *   GAYS_CRUISING_CONSENT_REF=<ref> node scripts/data-quality/crawl-gays-cruising.mjs
 *   GAYS_CRUISING_CONSENT_REF=<ref> node scripts/data-quality/crawl-gays-cruising.mjs --limit 10
 *   GAYS_CRUISING_CONSENT_REF=<ref> node scripts/data-quality/crawl-gays-cruising.mjs --retry-errors
 */

import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';

const ORIGIN = 'https://www.gays-cruising.com';
const INDEX_URL = `${ORIGIN}/sitemaps/sitemap_zonas_cruising_aprobadas_GC.xml`;
const OUT = join(process.cwd(), 'out-gays-cruising');
const OUTPUT = join(OUT, 'enriched_spots.jsonl');
const REPORT = join(OUT, 'crawl-report.json');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 QueerGuideImporter/1.0';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const next = args[index + 1];
  return !next || next.startsWith('--') ? true : next;
};
const has = (name) => args.includes(`--${name}`);
const CONCURRENCY = Math.max(1, Math.min(16, Number(flag('concurrency', 4)) || 4));
const LIMIT = flag('limit') ? Math.max(1, Number(flag('limit'))) : Infinity;
const DELAY_MS = Math.max(0, Number(flag('delay-ms', 250)) || 0);
const RETRY_ERRORS = has('retry-errors');
const HEADED = has('headed');
const MAX_ATTEMPTS = 5;
let stopRequested = false;

process.once('SIGINT', () => {
  stopRequested = true;
  console.log('\n[crawl] stop requested; finishing the current batch and preserving checkpoint');
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireConsent() {
  const ref = process.env.GAYS_CRUISING_CONSENT_REF?.trim();
  if (!ref) {
    throw new Error(
      'GAYS_CRUISING_CONSENT_REF is unset. The crawl requires the written-consent reference.',
    );
  }
  return ref;
}

function parseLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

function spotIdFromUrl(url) {
  const match = /_(\d+)$/.exec(url);
  return match ? Number(match[1]) : null;
}

function parseJsonp(text, expectedId) {
  const trimmed = String(text).trim();
  const match = /^gcWidgetAreaCallback(\d+)\((.*)\)$/s.exec(trimmed);
  if (!match) throw new Error('invalid_jsonp');
  if (Number(match[1]) !== expectedId) throw new Error('callback_id_mismatch');
  const raw = JSON.parse(match[2]);
  if (Number(raw.id) === 0) throw new Error('source_not_found');
  if (Number(raw.id) !== expectedId) throw new Error('payload_id_mismatch');
  const location = raw.localizacion ?? {};
  return {
    id: expectedId,
    title: typeof raw.titulo === 'string' ? raw.titulo.trim() : '',
    latitude: Number(raw.x),
    longitude: Number(raw.y),
    locality: typeof location.pobNombre === 'string' ? location.pobNombre.trim() : '',
    region: typeof location.regNombre === 'string' ? location.regNombre.trim() : '',
    country: typeof location.paisNombre === 'string' ? location.paisNombre.trim() : '',
    url:
      typeof raw.url === 'string' && raw.url
        ? raw.url
        : `${ORIGIN}/en/cruising/source_${expectedId}`,
  };
}

async function pageHtml(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  if (!response?.ok()) throw new Error(`navigation ${response?.status() ?? 'failed'}: ${url}`);
  return await page.content();
}

async function browserFetchMany(page, ids) {
  return await page.evaluate(
    async ({ ids: requestedIds }) =>
      await Promise.all(
        requestedIds.map(async (id) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 30_000);
          try {
            const response = await fetch(`/api/?op=obtenerZonaInfoWidget&id=${id}&idioma=en`, {
              signal: controller.signal,
            });
            return { id, status: response.status, text: await response.text() };
          } catch (error) {
            return { id, status: 0, text: '', error: String(error) };
          } finally {
            clearTimeout(timer);
          }
        }),
      ),
    { ids },
  );
}

async function fetchBatch(page, ids, warmId) {
  let pending = [...ids];
  const results = new Map();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length; attempt++) {
    const responses = await browserFetchMany(page, pending);
    const retry = [];
    let challenged = false;
    for (const response of responses) {
      try {
        if (response.status !== 200) {
          challenged ||= response.status === 403;
          throw new Error(response.error || `http_${response.status}`);
        }
        results.set(response.id, parseJsonp(response.text, response.id));
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          results.set(response.id, {
            id: response.id,
            error: error instanceof Error ? error.message : String(error),
            attempts: attempt,
          });
        } else {
          retry.push(response.id);
        }
      }
    }
    pending = retry;
    if (pending.length) {
      if (challenged) {
        await pageHtml(page, `${ORIGIN}/api/?op=obtenerZonaInfoWidget&id=${warmId}&idioma=en`);
      }
      await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
    }
  }
  return ids.map((id) => results.get(id));
}

async function loadCheckpoint() {
  const records = new Map();
  if (!existsSync(OUTPUT)) return records;
  const input = createReadStream(OUTPUT);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of lines) {
    lineNo++;
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`invalid checkpoint JSON at line ${lineNo}`);
    }
    if (!Number.isInteger(record.id) || record.id <= 0) {
      throw new Error(`invalid checkpoint id at line ${lineNo}`);
    }
    records.set(record.id, record);
  }
  if (RETRY_ERRORS) {
    for (const [id, record] of records) if (record.error) records.delete(id);
  }
  return records;
}

function compactCheckpoint(records, orderedIds) {
  const temporary = `${OUTPUT}.tmp`;
  const body = orderedIds
    .filter((id) => records.has(id))
    .map((id) => JSON.stringify(records.get(id)))
    .join('\n');
  writeFileSync(temporary, body ? `${body}\n` : '');
  renameSync(temporary, OUTPUT);
}

async function appendRecord(stream, record) {
  if (!stream.write(`${JSON.stringify(record)}\n`)) await once(stream, 'drain');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function buildReport(ids, records, startedAt, consentRef) {
  const usable = [...records.values()].filter((record) => !record.error);
  const countMissing = (key) => usable.filter((record) => !record[key]).length;
  return {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    consent_ref: consentRef,
    source: INDEX_URL,
    expected_ids: ids.length,
    records: records.size,
    usable: usable.length,
    errors: [...records.values()].filter((record) => record.error).length,
    unique_ids: new Set(records.keys()).size,
    missing: {
      title: countMissing('title'),
      coordinates: usable.filter(
        (record) =>
          !Number.isFinite(record.latitude) ||
          !Number.isFinite(record.longitude) ||
          (record.latitude === 0 && record.longitude === 0),
      ).length,
      locality: countMissing('locality'),
      region: countMissing('region'),
      country: countMissing('country'),
      url: countMissing('url'),
    },
    sha256: sha256(OUTPUT),
  };
}

async function main() {
  const consentRef = requireConsent();
  const startedAt = new Date().toISOString();
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ userAgent: USER_AGENT });
  try {
    console.log('[crawl] warming sitemap path');
    const indexHtml = await pageHtml(page, INDEX_URL);
    const childSitemaps = parseLocs(indexHtml).filter((url) => url.includes('/sitemaps/es/'));
    if (childSitemaps.length !== 3) {
      throw new Error(`expected 3 Spanish child sitemaps, found ${childSitemaps.length}`);
    }

    const spotUrls = [];
    for (const sitemap of childSitemaps) {
      const result = await page.evaluate(async (url) => {
        const response = await fetch(url);
        return { status: response.status, text: await response.text() };
      }, sitemap);
      if (result.status !== 200) throw new Error(`sitemap ${result.status}: ${sitemap}`);
      spotUrls.push(...parseLocs(result.text));
    }

    const ids = [];
    const seen = new Set();
    for (const url of spotUrls) {
      const id = spotIdFromUrl(url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    if (!ids.length) throw new Error('no spot IDs found in approved-zone sitemaps');
    console.log(`[crawl] ${ids.length} unique approved spot IDs`);

    const records = await loadCheckpoint();
    compactCheckpoint(records, ids);
    const selectedIds = ids.filter((id) => !records.has(id)).slice(0, LIMIT);
    console.log(`[crawl] ${records.size} checkpointed; ${selectedIds.length} selected this run`);

    if (selectedIds.length) {
      const warmId = selectedIds[0];
      console.log('[crawl] warming API path');
      await pageHtml(page, `${ORIGIN}/api/?op=obtenerZonaInfoWidget&id=${warmId}&idioma=en`);

      const output = createWriteStream(OUTPUT, { flags: 'a' });
      try {
        for (let index = 0; index < selectedIds.length; index += CONCURRENCY) {
          if (stopRequested) break;
          const batch = selectedIds.slice(index, index + CONCURRENCY);
          const fetched = await fetchBatch(page, batch, warmId);
          for (const record of fetched) {
            records.set(record.id, record);
            await appendRecord(output, record);
          }
          const done = Math.min(index + batch.length, selectedIds.length);
          if (done % 100 === 0 || done === selectedIds.length) {
            console.log(`[crawl] ${done}/${selectedIds.length} fetched this run`);
          }
          if (DELAY_MS) await sleep(DELAY_MS);
        }
      } finally {
        output.end();
        await once(output, 'close');
      }
    }

    compactCheckpoint(records, ids);
    const report = buildReport(ids, records, startedAt, consentRef);
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[crawl] ${JSON.stringify(report)}`);
    console.log(`[crawl] -> ${OUTPUT}`);
  } finally {
    await browser.close();
  }
}

await main();
