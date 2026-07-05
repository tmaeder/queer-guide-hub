/**
 * gaycities.com full event backfill (2012 → now), phased + resumable.
 *
 * Phases (run in order; each is independently resumable via JSONL state in
 * scraper/.gaycities-state/):
 *   --phase metros   discover metro dropdown → .gaycities-state/metros-raw.json
 *   --phase sweep    AJAX listing sweep 2022→now+18mo per metro → ajax-index.jsonl
 *   --phase cdx      Wayback CDX seed (2012→2021 ids)          → cdx-ids.jsonl
 *   --phase details  fetch every detail page (JSON-LD + body)  → details.jsonl / dead.jsonl
 *   --phase rescue   re-fetch dead ids from Wayback snapshots  → details.jsonl
 *   --phase stage    normalize + publish to ingestion_staging  → staged.jsonl / rejects.jsonl
 *
 * Env: SUPABASE_DB_URL (stage phase only).
 * Usage: npx tsx scripts/gaycities-backfill.ts --phase sweep
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright';
import {
  openSessionWithRetry,
  listMetros,
  fetchListing,
  parseListingCards,
  fetchDetail,
  parseDetailHtml,
  normalizeGcEvent,
  jitterDelay,
  quarterWindows,
  fmtUs,
  liveMetros,
  type MetroInfo,
  type EventStub,
  type EventDetail,
} from '../src/sources/gaycities/lib.js';
import { publishToStaging, shutdownPublisher, type PublishableEntity } from '../src/db/staging-publisher.js';

const STATE_DIR = path.resolve(import.meta.dirname, '../.gaycities-state');
const CURATED_METROS = path.resolve(import.meta.dirname, '../src/sources/gaycities/metros.json');
fs.mkdirSync(STATE_DIR, { recursive: true });

const f = (name: string) => path.join(STATE_DIR, name);

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function appendJsonl(file: string, obj: unknown): void {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── Phase: metros ──────────────────────────────────────────────

async function phaseMetros(): Promise<void> {
  let session = await openSessionWithRetry();
  try {
    const metros = await listMetros(session.page);
    log(`discovered ${metros.length} metros`);
    // Resolve each metro's subdomain by sampling one event card. A wide date
    // window guarantees results even for metros with no upcoming events;
    // parseListingCards is scoped to the metro results list, so the sampled
    // subdomain really belongs to this metro.
    const enriched: Array<Record<string, unknown>> = [];
    for (const m of metros) {
      let subdomain: string | null = null;
      for (let attempt = 0; attempt < 3 && !subdomain; attempt++) {
        try {
          const html = await fetchListing(session.page, {
            metroId: m.metroId,
            from: fmtUs(new Date(Date.UTC(2023, 0, 1))),
            to: fmtUs(new Date(Date.now() + 365 * 86_400_000)),
            page: 1,
          });
          const cards = parseListingCards(html);
          if (cards.length > 0) {
            const sub = cards[0].detailUrl.match(/^https?:\/\/([a-z0-9-]+)\.gaycities\.com/i);
            subdomain = sub && sub[1] !== 'www' ? sub[1].toLowerCase() : null;
          }
          break; // fetched fine — empty result is a real answer
        } catch (err) {
          const msg = (err as Error).message;
          log(`metro ${m.metroId} (${m.label}) sample failed: ${msg}`);
          if (msg.includes('403')) {
            // WAF hit poisons the session — recycle + cooldown, then retry.
            await session.close();
            await jitterDelay(25_000, 15_000);
            session = await openSessionWithRetry();
          } else {
            break;
          }
        }
      }
      enriched.push({ ...m, subdomain });
      log(`metro ${m.metroId} ${m.label} → subdomain=${subdomain ?? '?'}`);
      await jitterDelay(2_000, 1_500);
    }
    fs.writeFileSync(f('metros-raw.json'), JSON.stringify(enriched, null, 2));
    log(`wrote ${f('metros-raw.json')} — curate into src/sources/gaycities/metros.json`);
  } finally {
    await session.close();
  }
}

// ─── Phase: sweep ───────────────────────────────────────────────

interface SweepCursor {
  metroIdx: number;
  windowIdx: number;
}

function loadMetros(): MetroInfo[] {
  if (!fs.existsSync(CURATED_METROS)) {
    throw new Error(`curated metros.json missing at ${CURATED_METROS} — run --phase metros and curate first`);
  }
  return JSON.parse(fs.readFileSync(CURATED_METROS, 'utf8')) as MetroInfo[];
}

/**
 * GLOBAL windowed sweep (no metro filter). The WAF rate-caps selectTime
 * filter queries at roughly one per minute per IP — a per-metro × quarterly
 * matrix (96 × 18) is unrunnable, but global windows paginate the whole
 * site's events for a date range, so ~18 windows × page depth stays within
 * budget. Cards carry their own metro subdomains for attribution. On a 403
 * the session is recycled with a long cooldown and the same page retried.
 */
async function phaseSweep(): Promise<void> {
  const windows = quarterWindows(new Date(Date.UTC(2022, 0, 1)), new Date(Date.now() + 548 * 86_400_000));
  const cursorFile = f('sweep-cursor.json');
  const cursor: SweepCursor = fs.existsSync(cursorFile)
    ? (JSON.parse(fs.readFileSync(cursorFile, 'utf8')) as SweepCursor)
    : { metroIdx: 0, windowIdx: 0 };
  const seen = new Set(readJsonl<EventStub>(f('ajax-index.jsonl')).map((s) => s.numericId));
  log(`sweep: ${windows.length} global windows; resuming at window ${cursor.windowIdx}; ${seen.size} stubs known`);

  let session = await openSessionWithRetry();
  try {
    for (let wi = cursor.windowIdx; wi < windows.length; wi++) {
      const w = windows[wi];
      let empty = 0;
      for (let pageNo = 1; pageNo <= 200; pageNo++) {
        let html: string;
        try {
          html = await fetchListing(session.page, { from: w.from, to: w.to, page: pageNo });
        } catch (err) {
          log(`listing error ${w.from} p${pageNo}: ${(err as Error).message} — recycling session`);
          await session.close();
          await jitterDelay(45_000, 45_000);
          session = await openSessionWithRetry();
          pageNo--;
          continue;
        }
        const cards = parseListingCards(html);
        if (cards.length === 0) break;
        let fresh = 0;
        for (const card of cards) {
          if (seen.has(card.numericId)) continue;
          seen.add(card.numericId);
          appendJsonl(f('ajax-index.jsonl'), { ...card, metroId: undefined });
          fresh++;
        }
        log(`window ${w.from} p${pageNo}: ${cards.length} cards, ${fresh} new (total ${seen.size})`);
        if (fresh === 0) { empty++; if (empty >= 2) break; } else empty = 0;
        // Stay under the filter-query rate cap.
        await jitterDelay(55_000, 25_000);
      }
      fs.writeFileSync(cursorFile, JSON.stringify({ metroIdx: 0, windowIdx: wi + 1 }));
      log(`window ${w.from} done — ${seen.size} stubs total`);
    }
  } finally {
    await session.close();
  }
  log(`sweep complete: ${seen.size} unique event stubs`);
}

// ─── Phase: cdx ─────────────────────────────────────────────────

interface CdxRow {
  numericId: string;
  url: string;
  snapshotTs: string;
}

async function phaseCdx(): Promise<void> {
  const out = f('cdx-ids.jsonl');
  const known = new Map<string, CdxRow>();
  for (const r of readJsonl<CdxRow>(out)) known.set(r.numericId, r);
  let resumeKey: string | null = null;
  let pages = 0;
  do {
    const url =
      'https://web.archive.org/cdx/search/cdx?url=gaycities.com&matchType=domain' +
      '&filter=original:.*/events/[0-9].*&fl=original,timestamp&collapse=urlkey' +
      '&limit=5000&showResumeKey=true' +
      (resumeKey ? `&resumeKey=${encodeURIComponent(resumeKey)}` : '');
    const res = await fetch(url, { headers: { 'User-Agent': 'QueerGuideScraper/1.0 (contact@queer.guide)' } });
    if (!res.ok) throw new Error(`cdx_${res.status}`);
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim());
    resumeKey = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Resume key appears after a blank separator as the final token line.
      if (i === lines.length - 1 && !/https?:\/\//.test(line) && lines.length >= 2 && !/\d{14}$/.test(line)) {
        resumeKey = line.trim();
        continue;
      }
      const [original, ts] = line.split(' ');
      if (!original) continue;
      // Archived originals are messy (share-link suffixes /facebook/, quoted
      // URLs inside URLs). Rebuild the canonical permalink from the LAST
      // host+id+slug pattern in the string.
      const all = [...original.matchAll(/([a-z0-9.-]+)\.gaycities\.com\/events\/(\d+)(-[a-z0-9-]+)?/gi)];
      const m = all[all.length - 1];
      if (!m) continue;
      const numericId = m[2];
      const host = m[1].toLowerCase().replace(/^www\.?$/, 'www');
      const clean = `https://${host}.gaycities.com/events/${numericId}${m[3] ?? ''}`;
      const prev = known.get(numericId);
      if (!prev || (ts && ts > prev.snapshotTs)) {
        known.set(numericId, { numericId, url: clean, snapshotTs: ts ?? '' });
      }
    }
    pages++;
    log(`cdx page ${pages}: ${known.size} ids so far, resumeKey=${resumeKey ? 'yes' : 'no'}`);
    await jitterDelay(800, 500);
  } while (resumeKey);
  fs.writeFileSync(out, Array.from(known.values()).map((r) => JSON.stringify(r)).join('\n') + '\n');
  log(`cdx complete: ${known.size} distinct event ids`);
}

// ─── Phase: details ─────────────────────────────────────────────

/**
 * Live-fetch targets: AJAX-swept stubs (current data matters) plus CDX ids
 * whose Wayback snapshot didn't yield usable JSON-LD (live retry).
 * Historical CDX ids go Wayback-first (phase wayback) — no Cloudflare, no
 * browser, parallelizable — because for long-past events staleness is moot.
 */
function collectTargets(): Array<{ numericId: string; url: string; metroId?: string; snapshotTs?: string }> {
  const stubs = readJsonl<EventStub & { metroId?: string }>(f('ajax-index.jsonl'));
  const misses = readJsonl<{ numericId: string; url: string }>(f('wayback-miss.jsonl'));
  const done = new Set(readJsonl<{ numericId: string }>(f('details.jsonl')).map((d) => d.numericId));
  for (const d of readJsonl<{ numericId: string }>(f('dead.jsonl'))) done.add(d.numericId);
  const targets = new Map<string, { numericId: string; url: string; metroId?: string; snapshotTs?: string }>();
  for (const s of stubs) {
    if (!done.has(s.numericId)) targets.set(s.numericId, { numericId: s.numericId, url: s.detailUrl, metroId: s.metroId });
  }
  for (const m of misses) {
    if (!done.has(m.numericId) && !targets.has(m.numericId)) {
      targets.set(m.numericId, { numericId: m.numericId, url: m.url });
    }
  }
  return Array.from(targets.values());
}

async function phaseDetails(): Promise<void> {
  const targets = collectTargets();
  const workers = Math.max(1, Math.min(3, Number(process.argv[process.argv.indexOf('--workers') + 1]) || 2));
  log(`details: ${targets.length} pages to fetch with ${workers} worker(s)`);
  let done = 0;

  const runWorker = async (mine: typeof targets, wid: number): Promise<void> => {
    let session = await openSessionWithRetry();
    let consecutiveErrors = 0;
    let sinceRecycle = 0;
    try {
      for (const t of mine) {
        try {
          const detail = await fetchDetail(session.page, t.url);
          consecutiveErrors = 0;
          if (detail.dead) {
            appendJsonl(f('dead.jsonl'), { numericId: t.numericId, url: t.url, snapshotTs: t.snapshotTs ?? null });
          } else {
            appendJsonl(f('details.jsonl'), { ...detail, numericId: t.numericId, metroId: t.metroId ?? null });
          }
        } catch (err) {
          const msg = (err as Error).message;
          consecutiveErrors++;
          log(`w${wid} detail error ${t.url}: ${msg} (${consecutiveErrors} consecutive)`);
          // A WAF 403 poisons the whole session — recycle immediately.
          if (msg.includes('403') || consecutiveErrors >= 5) {
            log(`w${wid} recycling session + cooldown`);
            await session.close();
            await jitterDelay(20_000, 20_000);
            session = await openSessionWithRetry();
            consecutiveErrors = 0;
            sinceRecycle = 0;
          }
          // Leave the id un-logged so a re-run retries it.
        }
        done++;
        sinceRecycle++;
        if (done % 100 === 0) log(`details progress: ${done}/${targets.length}`);
        if (sinceRecycle >= 300) {
          await session.close();
          session = await openSessionWithRetry();
          sinceRecycle = 0;
        }
        await jitterDelay(800, 700);
      }
    } finally {
      await session.close();
    }
  };

  const shards: (typeof targets)[] = Array.from({ length: workers }, () => []);
  targets.forEach((t, i) => shards[i % workers].push(t));
  await Promise.all(shards.filter((s) => s.length).map((s, i) => runWorker(s, i)));
  log(`details complete: ${done} processed`);
}

// ─── Phase: wayback (snapshot-first harvest of historical CDX ids) ──────

/**
 * Fetch Wayback snapshots for every CDX id not already covered by the AJAX
 * sweep. No Cloudflare, no browser → a few parallel workers with 429 backoff.
 * Usable JSON-LD → details.jsonl (from_wayback); misses → wayback-miss.jsonl
 * for the live-browser details phase to retry.
 */
async function phaseWayback(sampleOnly: boolean): Promise<void> {
  const cdx = readJsonl<CdxRow>(f('cdx-ids.jsonl'));
  const ajaxIds = new Set(readJsonl<EventStub>(f('ajax-index.jsonl')).map((s) => s.numericId));
  const done = new Set(readJsonl<{ numericId: string }>(f('details.jsonl')).map((d) => d.numericId));
  for (const d of readJsonl<{ numericId: string }>(f('wayback-miss.jsonl'))) done.add(d.numericId);
  for (const d of readJsonl<{ numericId: string }>(f('dead.jsonl'))) done.add(d.numericId);
  const targets = cdx.filter((c) => c.snapshotTs && !ajaxIds.has(c.numericId) && !done.has(c.numericId));
  const batch = sampleOnly ? targets.slice(0, 200) : targets;
  const workers = Math.max(1, Math.min(8, Number(process.argv[process.argv.indexOf('--workers') + 1]) || 4));
  log(`wayback: ${batch.length} of ${targets.length} ids (sample=${sampleOnly}, workers=${workers})`);

  let ok = 0, miss = 0, doneCount = 0;
  const queue = [...batch];
  const worker = async (): Promise<void> => {
    for (;;) {
      const t = queue.shift();
      if (!t) return;
      const snapUrl = `https://web.archive.org/web/${t.snapshotTs}id_/${t.url}`;
      let backoff = 5_000;
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(snapUrl, {
            headers: { 'User-Agent': 'QueerGuideScraper/1.0 (contact@queer.guide)' },
            redirect: 'follow',
          });
          if (res.status === 429 || res.status === 503) throw new Error(`wayback_${res.status}`);
          if (!res.ok) {
            appendJsonl(f('wayback-miss.jsonl'), { numericId: t.numericId, url: t.url, reason: `snapshot_${res.status}` });
            miss++;
            break;
          }
          const html = await res.text();
          const detail = parseDetailHtml(html, t.url, { fromWayback: true });
          if (detail.jsonLd) {
            appendJsonl(f('details.jsonl'), { ...detail, numericId: t.numericId, metroId: null });
            ok++;
          } else {
            appendJsonl(f('wayback-miss.jsonl'), { numericId: t.numericId, url: t.url, reason: 'no_jsonld' });
            miss++;
          }
          break;
        } catch (err) {
          if (attempt >= 4) {
            appendJsonl(f('wayback-miss.jsonl'), { numericId: t.numericId, url: t.url, reason: (err as Error).message });
            miss++;
            break;
          }
          await new Promise((r) => setTimeout(r, backoff + Math.random() * backoff));
          backoff = Math.min(backoff * 2, 120_000);
        }
      }
      doneCount++;
      if (doneCount % 500 === 0) log(`wayback progress: ${doneCount}/${batch.length} (ok=${ok} miss=${miss})`);
      await jitterDelay(100, 200);
    }
  };
  await Promise.all(Array.from({ length: workers }, () => worker()));
  log(`wayback done: ok=${ok} miss=${miss} of ${batch.length} (${((ok / Math.max(batch.length, 1)) * 100).toFixed(0)}% usable)`);
}

// ─── Phase: stage ───────────────────────────────────────────────

async function phaseStage(): Promise<void> {
  const metros = loadMetros();
  const byMetroId = new Map(metros.map((m) => [m.metroId, m]));
  const bySubdomain = new Map(metros.filter((m) => m.subdomain).map((m) => [m.subdomain as string, m]));
  // Old www.gaycities.com pages carry no metro/subdomain — match the page's
  // own locality text against metro city names/labels as a last resort.
  const byCity = new Map<string, MetroInfo>();
  for (const m of metros) {
    byCity.set(m.city.toLowerCase(), m);
    byCity.set(m.label.toLowerCase(), m);
  }
  const localityOf = (d: EventDetail): string | null => {
    const ld = d.jsonLd as Record<string, unknown> | null;
    const loc = (ld?.['location'] ?? {}) as Record<string, unknown>;
    const addr = (loc['address'] ?? {}) as Record<string, unknown>;
    return typeof addr['addressLocality'] === 'string' ? (addr['addressLocality'] as string).toLowerCase() : null;
  };
  const staged = new Set(readJsonl<{ numericId: string }>(f('staged.jsonl')).map((s) => s.numericId));
  const details = readJsonl<EventDetail & { numericId: string; metroId: string | null }>(f('details.jsonl'));
  log(`stage: ${details.length} details, ${staged.size} already staged`);

  let batch: PublishableEntity[] = [];
  let batchIds: string[] = [];
  let total = { inserted: 0, duplicates: 0, failed: 0, rejected: 0 };

  const flush = async () => {
    if (batch.length === 0) return;
    const res = await publishToStaging(batch, {
      sourceSlug: 'gaycities',
      sourceType: 'browser',
      targetTable: 'events',
    });
    total.inserted += res.inserted;
    total.duplicates += res.duplicates;
    total.failed += res.failed;
    for (const id of batchIds) appendJsonl(f('staged.jsonl'), { numericId: id });
    batch = [];
    batchIds = [];
  };

  const seenThisRun = new Set<string>();
  for (const d of details) {
    if (!d.numericId || staged.has(d.numericId) || seenThisRun.has(d.numericId)) continue;
    seenThisRun.add(d.numericId);
    const metro =
      (d.metroId && byMetroId.get(d.metroId)) ||
      (d.subdomain && bySubdomain.get(d.subdomain)) ||
      (localityOf(d) && byCity.get(localityOf(d)!)) ||
      null;
    const norm = normalizeGcEvent(d, metro || null);
    if ('reject' in norm) {
      appendJsonl(f('rejects.jsonl'), { numericId: d.numericId, url: d.url, reason: norm.reject });
      total.rejected++;
      continue;
    }
    batch.push({
      source_name: 'gaycities',
      source_id: d.numericId,
      entity_type: 'event',
      url: d.url,
      raw_data: { jsonLd: d.jsonLd, tagSlugs: d.tagSlugs, subdomain: d.subdomain, fromWayback: d.fromWayback ?? false, url: d.url },
      fetched_at: new Date(d.fetchedAt ?? Date.now()),
      normalized_data: norm,
    });
    batchIds.push(d.numericId);
    if (batch.length >= 200) await flush();
  }
  await flush();
  await shutdownPublisher();
  log(`stage complete: inserted=${total.inserted} duplicates=${total.duplicates} failed=${total.failed} rejected=${total.rejected}`);
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const phaseArg = process.argv.indexOf('--phase');
  const phase = phaseArg >= 0 ? process.argv[phaseArg + 1] : null;
  const sample = process.argv.includes('--sample');
  switch (phase) {
    case 'metros': return phaseMetros();
    case 'sweep': return phaseSweep();
    case 'cdx': return phaseCdx();
    case 'wayback': return phaseWayback(sample);
    case 'details': return phaseDetails();
    case 'stage': return phaseStage();
    default:
      console.error('usage: gaycities-backfill.ts --phase metros|sweep|cdx|wayback|details|stage [--sample] [--workers N]');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
