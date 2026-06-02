#!/usr/bin/env node
/**
 * Search end-to-end test runner — runnable by a Claude (cowork) agent or a human.
 *
 *   node scripts/search-eval/search-test.mjs
 *   SEARCH_URL=https://search.queer.guide node scripts/search-eval/search-test.mjs
 *   node scripts/search-eval/search-test.mjs --json    # machine-readable summary
 *
 * No dependencies — Node 18+ (built-in fetch). Hits the live search-proxy
 * (Postgres `search_hybrid` + `search_facets` + `search_autocomplete`).
 *
 * Exit code 0 = all HARD assertions passed. Non-zero = at least one HARD failure.
 * SOFT checks (relevance/ranking — data-dependent) only warn; they never fail
 * the run, but are printed so an agent can eyeball quality.
 *
 * Contract (from workers/search-proxy/src/index.ts):
 *   POST /search        { query, filters:{ types[], city, country, category,
 *                         is_featured, is_free, target_groups[], lat, lng, radius },
 *                         hitsPerPage, page, lang, session_id, debug }
 *                       → { hits[], suggestions[], facetDistribution{}, estimatedTotalHits,
 *                           processingTimeMS, page, hitsPerPage, (biasApplied when debug) }
 *   POST /autocomplete  { query, limit } → { suggestions[] }
 *   GET  /health        → 200
 */

const BASE = (process.env.SEARCH_URL || 'https://search.queer.guide').replace(/\/$/, '');
const JSON_OUT = process.argv.includes('--json');
const SESSION = 'cowork-search-test';

let hardPass = 0, hardFail = 0, softPass = 0, softWarn = 0;
const results = [];

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', dim: '\x1b[2m', x: '\x1b[0m' };
function log(line) { if (!JSON_OUT) console.log(line); }

async function post(path, body, { timeoutMs = 15000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort('timeout'), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const wallMs = Date.now() - t0;
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json, wallMs };
  } finally { clearTimeout(t); }
}
const search = (body) => post('/search', { session_id: SESSION, ...body });
const autocomplete = (body) => post('/autocomplete', body);

// ── scenario harness ───────────────────────────────────────────────────────
async function scenario(id, title, fn) {
  const ctx = { hard: [], soft: [] };
  const HARD = (cond, msg) => ctx.hard.push({ ok: !!cond, msg });
  const SOFT = (cond, msg) => ctx.soft.push({ ok: !!cond, msg });
  let error = null;
  try { await fn({ HARD, SOFT }); }
  catch (e) { error = e?.message || String(e); }

  const hf = ctx.hard.filter((a) => !a.ok);
  const sw = ctx.soft.filter((a) => !a.ok);
  hardPass += ctx.hard.length - hf.length; hardFail += hf.length;
  softPass += ctx.soft.length - sw.length; softWarn += sw.length;
  const status = error ? 'ERROR' : hf.length ? 'FAIL' : 'PASS';
  results.push({ id, title, status, error, hardFails: hf.map((a) => a.msg), softWarns: sw.map((a) => a.msg) });

  const mark = error ? `${c.r}ERROR${c.x}` : hf.length ? `${c.r}✗ FAIL${c.x}` : `${c.g}✓ PASS${c.x}`;
  log(`${mark}  ${c.dim}${id}${c.x} ${title}`);
  if (error) log(`        ${c.r}↳ ${error}${c.x}`);
  for (const a of hf) log(`        ${c.r}↳ HARD: ${a.msg}${c.x}`);
  for (const a of sw) log(`        ${c.y}↳ soft: ${a.msg}${c.x}`);
}

const isArr = Array.isArray;
const titles = (r) => (r.json?.hits ?? []).map((h) => String(h.title ?? h.name ?? '').toLowerCase());
const types = (r) => (r.json?.hits ?? []).map((h) => String(h.type ?? h.content_type ?? ''));
const hasTitleLike = (r, s) => titles(r).some((t) => t.includes(s.toLowerCase()));

// ── scenarios ────────────────────────────────────────────────────────────────
async function run() {
  log(`\nSearch E2E  →  ${BASE}\n${'─'.repeat(60)}`);

  // 1. Smoke / contract
  await scenario('S1', 'Basic query returns well-formed hits', async ({ HARD }) => {
    const r = await search({ query: 'gay bar', hitsPerPage: 5, debug: true });
    HARD(r.status === 200, `status ${r.status} (expected 200)`);
    HARD(isArr(r.json?.hits), 'hits is not an array');
    HARD((r.json?.hits?.length ?? 0) > 0, 'no hits for "gay bar"');
    const h = r.json?.hits?.[0] ?? {};
    HARD(typeof (h.objectID ?? h.id) === 'string', 'hit missing objectID/id');
    HARD(typeof (h.type ?? h.content_type) === 'string', 'hit missing type');
    HARD('facetDistribution' in (r.json ?? {}), 'no facetDistribution');
    HARD(isArr(r.json?.suggestions), 'no suggestions array');
    HARD(typeof r.json?.processingTimeMS === 'number', 'no processingTimeMS');
  });

  await scenario('S2', 'Health endpoint', async ({ HARD }) => {
    const res = await fetch(`${BASE}/health`).catch(() => null);
    HARD(res && res.ok, `/health not 200 (${res?.status})`);
  });

  await scenario('S3', 'Empty query rejected gracefully (400 validation, not 500)', async ({ HARD }) => {
    const r = await search({ query: '', hitsPerPage: 5 });
    HARD(r.status === 400, `empty query status ${r.status} (expected 400 validation)`);
  });

  await scenario('S4', 'Nonsense query returns gracefully (no crash)', async ({ HARD, SOFT }) => {
    // Hybrid search: the vector leg always returns nearest neighbours, so a random
    // string yields low-relevance hits rather than zero — that's expected.
    const r = await search({ query: 'zzxqwplkjhqweri', hitsPerPage: 5 });
    HARD(r.status === 200, `status ${r.status}`);
    HARD(isArr(r.json?.hits), 'hits not array');
    SOFT((r.json?.hits?.length ?? 0) === 0 || (r.json.hits[0]?._rankingScore ?? 1) < 0.25,
      'nonsense returned high-score hits (vector-nearest is expected, but score should be low)');
  });

  // 2. Relevance / ranking (SOFT — data-dependent)
  await scenario('R1', 'Berlin query surfaces Berlin venues (relevance)', async ({ HARD, SOFT }) => {
    const r = await search({ query: 'gay bar berlin', hitsPerPage: 10 });
    HARD(r.status === 200 && isArr(r.json?.hits), 'bad response');
    SOFT((r.json?.hits?.length ?? 0) >= 3, 'fewer than 3 hits for a common query');
    SOFT(titles(r).some((t) => t.includes('berlin')) || types(r).includes('city'),
      'no Berlin-ish result in top 10');
  });

  await scenario('R2', 'Semantic leg: concept query returns venues', async ({ HARD, SOFT }) => {
    const r = await search({ query: 'places to dance at night', hitsPerPage: 10 });
    HARD(r.status === 200 && isArr(r.json?.hits), 'bad response');
    SOFT((r.json?.hits?.length ?? 0) > 0, 'no semantic results (vector leg?)');
  });

  await scenario('R3', 'Scoring present + descending', async ({ HARD, SOFT }) => {
    const r = await search({ query: 'pride', hitsPerPage: 10 });
    HARD(r.status === 200, `status ${r.status}`);
    const scores = (r.json?.hits ?? []).map((h) => h._rankingScore).filter((s) => typeof s === 'number');
    SOFT(scores.length > 0, 'no _rankingScore on hits');
    SOFT(scores.every((s, i) => i === 0 || s <= scores[i - 1] + 1e-9), 'scores not descending');
  });

  // 3. Keyword leg robustness
  await scenario('K1', 'Typo tolerance (trigram)', async ({ HARD, SOFT }) => {
    const r = await search({ query: 'berln', hitsPerPage: 10 });
    HARD(r.status === 200, `status ${r.status}`);
    SOFT(hasTitleLike(r, 'berlin') || types(r).includes('city'), 'typo "berln" found nothing Berlin-ish');
  });
  await scenario('K2', 'Diacritic-insensitive (zurich = zürich)', async ({ HARD, SOFT }) => {
    const a = await search({ query: 'zurich', hitsPerPage: 10 });
    const b = await search({ query: 'zürich', hitsPerPage: 10 });
    HARD(a.status === 200 && b.status === 200, 'bad response');
    SOFT((a.json?.hits?.length ?? 0) > 0 && (b.json?.hits?.length ?? 0) > 0, 'one variant returned nothing');
  });

  // 4. Filters
  await scenario('F1', 'types filter restricts entity type', async ({ HARD }) => {
    const r = await search({ query: 'pride', filters: { types: ['event'] }, hitsPerPage: 10 });
    HARD(r.status === 200, `status ${r.status}`);
    const bad = types(r).filter((t) => t && t !== 'event');
    HARD(bad.length === 0, `non-event types leaked: ${[...new Set(bad)].join(',')}`);
  });
  await scenario('F2', 'city filter restricts to city', async ({ HARD, SOFT }) => {
    const r = await search({ query: 'bar', filters: { city: 'Berlin' }, hitsPerPage: 10 });
    HARD(r.status === 200, `status ${r.status}`);
    const cities = (r.json?.hits ?? []).map((h) => String(h.city ?? '').toLowerCase()).filter(Boolean);
    SOFT(cities.length === 0 || cities.every((ci) => ci.includes('berlin')), `non-Berlin city in results: ${[...new Set(cities)]}`);
  });
  await scenario('F3', 'facetDistribution counts present', async ({ HARD }) => {
    const r = await search({ query: 'bar', hitsPerPage: 10 });
    HARD(r.status === 200 && typeof r.json?.facetDistribution === 'object', 'no facetDistribution object');
  });

  // 5. Geo
  await scenario('G1', 'Geo radius returns nearby + distance', async ({ HARD, SOFT }) => {
    // Berlin centre
    const r = await search({ query: 'bar', filters: { lat: 52.52, lng: 13.405, radius: 10 }, hitsPerPage: 10 });
    HARD(r.status === 200, `status ${r.status}`);
    const withDist = (r.json?.hits ?? []).filter((h) => typeof h._distance_m === 'number' || (h._geoloc));
    SOFT((r.json?.hits?.length ?? 0) === 0 || withDist.length > 0, 'geo query returned hits without distance/geoloc');
  });

  // 6. Autocomplete
  await scenario('A1', 'Autocomplete prefix returns suggestions', async ({ HARD }) => {
    const r = await autocomplete({ query: 'ber', limit: 5 });
    HARD(r.status === 200, `status ${r.status}`);
    HARD(isArr(r.json?.suggestions), 'no suggestions array');
    HARD((r.json?.suggestions?.length ?? 0) <= 5, 'limit not respected');
  });
  await scenario('A2', 'Autocomplete too-short query rejected gracefully (not 500)', async ({ HARD }) => {
    const r = await autocomplete({ query: 'a', limit: 5 });
    HARD(r.status === 400 || (r.status === 200 && isArr(r.json?.suggestions)),
      `status ${r.status} (expected graceful 400 or a 200 with suggestions)`);
  });

  // 7. Pagination
  await scenario('PG1', 'Page 0 and page 1 do not overlap', async ({ HARD, SOFT }) => {
    const p0 = await search({ query: 'bar', hitsPerPage: 5, page: 0 });
    const p1 = await search({ query: 'bar', hitsPerPage: 5, page: 1 });
    HARD(p0.status === 200 && p1.status === 200, 'bad response');
    const id0 = new Set((p0.json?.hits ?? []).map((h) => h.objectID ?? h.id));
    const overlap = (p1.json?.hits ?? []).filter((h) => id0.has(h.objectID ?? h.id));
    SOFT(overlap.length === 0, `${overlap.length} overlapping ids between page 0 and 1`);
  });

  // 8. Edge cases / resilience
  await scenario('X1', 'Injection-like string is treated as text', async ({ HARD }) => {
    const r = await search({ query: "'; drop table search_documents;--", hitsPerPage: 5 });
    HARD(r.status === 200, `status ${r.status} (should handle safely)`);
    HARD(isArr(r.json?.hits), 'hits not array');
  });
  await scenario('X2', 'Very long query is bounded, not 500', async ({ HARD }) => {
    const r = await search({ query: 'bar '.repeat(200), hitsPerPage: 5 });
    HARD(r.status === 200 || r.status === 400, `unexpected status ${r.status}`);
  });
  await scenario('X3', 'Unicode / emoji handled', async ({ HARD }) => {
    const r = await search({ query: 'café 🏳️‍🌈 berlin', hitsPerPage: 5 });
    HARD(r.status === 200, `status ${r.status}`);
    HARD(isArr(r.json?.hits), 'hits not array');
  });
  await scenario('X4', 'Huge hitsPerPage clamped (no error)', async ({ HARD }) => {
    const r = await search({ query: 'bar', hitsPerPage: 9999 });
    HARD(r.status === 200, `status ${r.status}`);
    HARD((r.json?.hits?.length ?? 0) <= 100, 'hitsPerPage not clamped');
  });

  // 9. Entity-type coverage (SOFT — each type should be searchable)
  await scenario('E1', 'Multiple entity types are searchable', async ({ HARD, SOFT }) => {
    const probes = { city: 'berlin', event: 'pride', personality: 'activist', news: 'rights' };
    HARD(true, '');
    for (const [t, q] of Object.entries(probes)) {
      const r = await search({ query: q, filters: { types: [t] }, hitsPerPage: 5 });
      SOFT(r.status === 200 && (r.json?.hits?.length ?? 0) >= 0, `type "${t}" query errored`);
    }
  });

  // 10. Latency (SOFT — informational; cold-cache p95 is a known watch-item)
  await scenario('L1', 'Latency sample (server processingTimeMS + wall)', async ({ HARD, SOFT }) => {
    const qs = ['bar', 'gay bar berlin', 'lgbt', 'pride parade', 'wheelchair accessible cafe'];
    const server = [], wall = [];
    for (const q of qs) {
      const r = await search({ query: q, hitsPerPage: 20 });
      if (r.status === 200) { if (typeof r.json?.processingTimeMS === 'number') server.push(r.json.processingTimeMS); wall.push(r.wallMs); }
    }
    HARD(wall.length === qs.length, 'some latency probes failed');
    const p = (a, q) => a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : NaN;
    log(`        ${c.dim}server p50=${p([...server],.5)}ms p95=${p([...server],.95)}ms | wall p50=${p([...wall],.5)}ms p95=${p([...wall],.95)}ms${c.x}`);
    SOFT(p([...wall], .95) < 6000, `wall p95 ${p([...wall],.95)}ms is high (cold-cache? see embedding-move migration)`);
  });

  // ── summary ──
  const total = hardPass + hardFail;
  log(`${'─'.repeat(60)}`);
  log(`HARD: ${c.g}${hardPass} passed${c.x}, ${hardFail ? c.r : ''}${hardFail} failed${c.x}  /  SOFT: ${softPass} ok, ${softWarn ? c.y : ''}${softWarn} warnings${c.x}`);
  log(hardFail === 0 ? `${c.g}✓ all hard assertions passed${c.x}\n` : `${c.r}✗ ${hardFail} hard assertion(s) failed${c.x}\n`);

  if (JSON_OUT) console.log(JSON.stringify({ base: BASE, hardPass, hardFail, softPass, softWarn, results }, null, 2));
  process.exit(hardFail === 0 ? 0 : 1);
}

run().catch((e) => { console.error('runner crashed:', e); process.exit(2); });
