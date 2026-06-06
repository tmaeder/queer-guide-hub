#!/usr/bin/env node
// Backfill full-text content for thin live news_articles (content < 120 chars), the
// pre-2026-05-30 corpus that predates the pipeline-extract-fulltext node. Re-fetches the
// article URL and recovers the main body Readability-style, writing content + excerpt.
//
// Extraction is a faithful jsdom port of supabase/functions/_shared/news-quality/extract.ts
// (the shipped pipeline extractor) so backfilled content matches new-ingest output. jsdom
// resolves from the repo root node_modules; no extra install. cheerio is the original dep
// but isn't installed here — jsdom is.
//
// Conservative: only swaps content when extraction yields materially MORE text than what's
// there (>= MIN_GAIN_RATIO x current, >= 250 chars). Never blanks an article on failure
// (404 / paywall / non-HTML → skipped, left as-is). Per-row writes stay under the
// search_documents_sync() reindex-trigger statement-timeout.
//
// Resumable via an id-keyset cursor file (failed/skipped rows are passed by the cursor, not
// retried). Disk-guarded: prod DB is disk-constrained; hard-stops if it crosses the stop line.
//
// Run (detached, supervised): see scripts/run-supervised.sh
//   GEOCODE_TOKEN=sbp_... node scripts/backfill-news-fulltext.mjs
// Token: RAW=$(security find-generic-password -s "Supabase CLI" -w); echo "${RAW#go-keyring-base64:}" | base64 -d
//
// Exit codes: 0 = corpus exhausted (done) · 42 = stopped at disk guard (do NOT auto-restart)
//             1 = fatal error (supervisor should restart; cursor makes it resume)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

// Swallow jsdom's CSS-parse / csstree-match warnings — pure noise, extraction is unaffected.
const SILENT_VC = new VirtualConsole();

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;
const UA_FETCH = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)';
const UA_MGMT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) QueerGuide/1.0';
const CURSOR_FILE = 'scripts/output/news-fulltext.cursor';
const BATCH = Number(process.env.BATCH || 40);
const SLEEP_MS = Number(process.env.SLEEP_MS || 400);   // between article fetches
const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 3_000_000;
const MIN_GAIN_RATIO = 1.2;
const DISK_STOP_BYTES = Number(process.env.DISK_STOP_MB || 6300) * 1024 * 1024;
const DISK_CHECK_EVERY = 5; // batches
const DRY_RUN = process.env.DRY_RUN === '1';

if (!TOKEN) { console.error('GEOCODE_TOKEN not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (s) => (s == null ? null : String(s).replace(/'/g, "''"));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function fetchT(url, opts = {}, timeoutMs = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function mgmt(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(MGMT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA_MGMT },
        body: JSON.stringify({ query: sql }),
      }, 30000);
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 * (i + 1)); // also covers DNS/network blips (ENOTFOUND, abort)
    }
  }
}

async function fetchHtml(url) {
  try {
    const res = await fetchT(url, { redirect: 'follow', headers: { 'user-agent': UA_FETCH, accept: 'text/html,application/xhtml+xml' } }, FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(ct)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;
    return new TextDecoder('utf-8').decode(buf);
  } catch { return null; }
}

// ───────────────────────── extractArticle (jsdom port of extract.ts) ─────────────────────────
const NOISE_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'iframe', 'svg', 'form',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]', '[aria-hidden="true"]',
  '.ad', '.ads', '.advert', '.advertisement', '.share', '.social',
  '.newsletter', '.related', '.recommended', '.comments', '.comment',
  '.cookie', '.consent', '.subscribe', '.paywall', '.promo', '.sidebar',
  'figure figcaption',
].join(',');
const ARTICLE_TYPES = new Set(['NewsArticle', 'Article', 'ReportageNewsArticle', 'BlogPosting', 'OpinionNewsArticle']);

const txt = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function elementToText(el) {
  const parts = [];
  el.querySelectorAll('p, h1, h2, h3, h4, li, blockquote').forEach((node) => {
    const t = txt(node);
    if (t.length >= 2) parts.push(t);
  });
  if (parts.length === 0) { const t = txt(el); if (t) parts.push(t); }
  const deduped = [];
  for (const p of parts) if (p !== deduped[deduped.length - 1]) deduped.push(p);
  return deduped.join('\n\n').trim();
}

function collectJsonLd(doc) {
  const out = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    const raw = (el.textContent ?? '').trim();
    if (!raw) return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (node && typeof node === 'object') {
        out.push(node);
        if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
      }
    }
  });
  return out;
}

function isArticleNode(node) {
  const t = node['@type'];
  if (!t) return false;
  if (typeof t === 'string') return ARTICLE_TYPES.has(t);
  if (Array.isArray(t)) return t.some((x) => ARTICLE_TYPES.has(String(x)));
  return false;
}

function extractArticle(html, url) {
  const result = { content: '', method: 'none', charCount: 0 };
  if (!html || html.length < 50) return result;
  let dom;
  try { dom = new JSDOM(html, { url, virtualConsole: SILENT_VC }); } catch { return result; }
  const doc = dom.window.document;
  try {
    const ld = collectJsonLd(doc);
    const articleLd = ld.find(isArticleNode) ?? null;

    // Strategy 1: JSON-LD articleBody
    if (articleLd && typeof articleLd.articleBody === 'string') {
      const body = articleLd.articleBody.replace(/\r\n/g, '\n').trim();
      if (body.length >= 200) return { content: body, method: 'jsonld', charCount: body.length };
    }

    doc.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove());

    // Strategy 2: <article>
    const articleEl = [...doc.querySelectorAll('article')]
      .map((el) => ({ el, text: elementToText(el) }))
      .sort((a, b) => b.text.length - a.text.length)[0];
    if (articleEl && articleEl.text.length >= 250) return { content: articleEl.text, method: 'article', charCount: articleEl.text.length };

    // Strategy 3: <main> / [role=main]
    const mainEl = [...doc.querySelectorAll('main, [role="main"]')]
      .map((el) => ({ el, text: elementToText(el) }))
      .sort((a, b) => b.text.length - a.text.length)[0];
    if (mainEl && mainEl.text.length >= 250) return { content: mainEl.text, method: 'main', charCount: mainEl.text.length };

    // Strategy 4: densest <p>-cluster container
    const scores = new Map();
    doc.querySelectorAll('p').forEach((p) => {
      const len = txt(p).length;
      if (len < 40) return;
      const parent = p.parentElement;
      if (!parent) return;
      scores.set(parent, (scores.get(parent) ?? 0) + len);
    });
    let best = null, bestScore = 0;
    for (const [el, score] of scores) if (score > bestScore) { bestScore = score; best = el; }
    if (best && bestScore >= 250) {
      const text = elementToText(best);
      if (text.length >= 250) return { content: text, method: 'density', charCount: text.length };
    }
    return result;
  } finally {
    dom.window.close();
  }
}
// ──────────────────────────────────────────────────────────────────────────────────────────────

function excerptFrom(content) {
  const firstPara = content.split('\n\n').find((p) => p.trim().length >= 40) || content;
  const clean = firstPara.replace(/\s+/g, ' ').trim();
  return clean.length > 300 ? clean.slice(0, 297).replace(/\s+\S*$/, '') + '…' : clean;
}

function readCursor() { try { return existsSync(CURSOR_FILE) ? readFileSync(CURSOR_FILE, 'utf8').trim() : '00000000-0000-0000-0000-000000000000'; } catch { return '00000000-0000-0000-0000-000000000000'; } }
function writeCursor(id) { try { writeFileSync(CURSOR_FILE, id); } catch {} }

async function diskBytes() {
  const r = await mgmt(`SELECT pg_database_size(current_database()) AS b`);
  return Number(r?.[0]?.b || 0);
}

async function main() {
  let cursor = readCursor();
  console.log(`[${ts()}] news full-text backfill starting (cursor=${cursor}, batch=${BATCH}, dry=${DRY_RUN})`);
  const startDisk = await diskBytes();
  console.log(`[${ts()}] DB size: ${(startDisk / 1048576).toFixed(0)} MB (stop line ${(DISK_STOP_BYTES / 1048576).toFixed(0)} MB)`);
  let processed = 0, extracted = 0, skipped = 0, failed = 0, batchNo = 0;
  for (;;) {
    const rows = await mgmt(
      `SELECT id, title, url, content, excerpt FROM news_articles
       WHERE duplicate_of_id IS NULL AND length(coalesce(content,'')) < 120
         AND url ~* '^https?://' AND id > '${cursor}'
       ORDER BY id LIMIT ${BATCH}`
    );
    if (!rows || rows.length === 0) break;
    batchNo++;
    if (batchNo % DISK_CHECK_EVERY === 0) {
      const d = await diskBytes();
      console.log(`[${ts()}] disk check: ${(d / 1048576).toFixed(0)} MB`);
      if (d > DISK_STOP_BYTES) {
        console.error(`[${ts()}] DISK GUARD: ${(d / 1048576).toFixed(0)} MB > stop line — halting (resume later).`);
        process.exit(42);
      }
    }
    for (const a of rows) {
      processed++;
      try {
        const html = await fetchHtml(a.url);
        const art = html ? extractArticle(html, a.url) : null;
        const cur = (a.content || '').length;
        if (art && art.content && art.content.length >= 250 && art.content.length > cur * MIN_GAIN_RATIO) {
          const sets = [`content='${sq(art.content)}'`];
          if (!a.excerpt || a.excerpt.length < 60) sets.push(`excerpt='${sq(excerptFrom(art.content))}'`);
          sets.push('updated_at=now()');
          if (!DRY_RUN) await mgmt(`UPDATE news_articles SET ${sets.join(', ')} WHERE id='${a.id}'`);
          extracted++;
        } else {
          skipped++;
        }
      } catch (e) {
        failed++;
        console.error(`[${ts()}] row ${a.id} error (skipping): ${e.message}`);
      }
      cursor = a.id;
      await sleep(SLEEP_MS);
    }
    writeCursor(cursor);
    console.log(`[${ts()}] processed=${processed} extracted=${extracted} skipped=${skipped} failed=${failed} cursor=${cursor}`);
  }
  const endDisk = await diskBytes();
  console.log(`[${ts()}] DONE. processed=${processed} extracted=${extracted} skipped=${skipped} failed=${failed}`);
  console.log(`[${ts()}] DB size: ${(startDisk / 1048576).toFixed(0)} MB → ${(endDisk / 1048576).toFixed(0)} MB (+${((endDisk - startDisk) / 1048576).toFixed(0)} MB)`);
}

main().catch((e) => { console.error(`[${ts()}] FATAL`, e); process.exit(1); });
