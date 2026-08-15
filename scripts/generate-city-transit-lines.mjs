#!/usr/bin/env node
/**
 * generate-city-transit-lines.mjs
 *
 * Turns each featured city's REAL rapid-transit network into an octilinear
 * subway-diagram abstraction small enough to sit on a homepage city card.
 *
 * One-shot, run by hand. The output is committed and reviewed like source:
 * `src/components/home/subway/cityNetworkGeometry.ts`. Nothing fetches
 * Overpass at runtime, and there is no cron.
 *
 *   node scripts/generate-city-transit-lines.mjs --dry-run   # contact sheet only
 *   node scripts/generate-city-transit-lines.mjs             # write the data file
 *
 * Env: reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env to look up
 * each whitelist city's slug + lat/lon (`cities` is anon-readable).
 *
 * Pipeline per city:
 *   Overpass route relations → assemble each relation's ways into one polyline
 *   → group directional variants by ref → keep the 4 longest lines
 *   → Douglas-Peucker (tolerance auto-tuned to hit a point budget)
 *   → octilinearize (every segment snapped to 0/45/90°)
 *   → normalize onto an INTEGER lattice inside the 200x110 viewBox
 *
 * The integer lattice is load-bearing: a diagonal step of k units is exactly
 * (±k, ±k), so "every segment bearing is a multiple of 45°" survives being
 * serialised as text and is checkable in a unit test without a tolerance.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(ROOT, 'src/components/home/subway/cityNetworkGeometry.ts');
const SHEET_FILE = resolve(ROOT, 'scripts/output/city-transit-contact-sheet.html');
const CACHE_DIR = resolve(ROOT, 'scripts/output/.overpass-cache');

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

// ---------------------------------------------------------------- tunables

const VIEW_W = 200;
const VIEW_H = 110;
const PAD = 10; // keeps the 6px station ring and the 5px line off the edge
const MAX_LINES = 4;
const MAX_POINTS = 9; // per line, after simplification
const MIN_POINTS = 4;
const SEARCH_RADIUS_M = 25000;
// Lines are ranked by how much of them falls inside this radius, not by total
// length — see coreLength().
const CORE_RADIUS_M = 12000;
// Rotated on failure. A single query for all three modes over a 25 km radius
// 504s on the main endpoint for tram-heavy cities, so this asks one mode at a
// time (see fetchRoutes) and rotates mirrors when one is busy.
const OVERPASS_ENDPOINTS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.osm.ch/api/interpreter',
    ];
const UA = 'QueerGuideBot/1.0 (contact@queer.guide)';
const SLEEP_MS = Number(process.env.SLEEP_MS || 3000);

/** Length rank → track. The flagship line is pink. */
const TRACKS = ['pink', 'blue', 'green', 'yellow'];

/** Modes in preference order. A city resolves to the first one it really has. */
const MODES = ['subway', 'light_rail', 'tram'];
const MIN_LINES_FOR_MODE = 2; // 1 lonely subway line loses to a real tram network

// Kept in sync with FEATURED_CITY_WHITELIST in src/hooks/usePersonalizedCities.ts.
const CITY_NAMES = [
  'Berlin', 'Madrid', 'Barcelona', 'Amsterdam', 'Mexico City', 'Bangkok',
  'Tel Aviv', 'Lisbon', 'Buenos Aires', 'Toronto', 'Montreal', 'San Francisco',
  'New York', 'Los Angeles', 'London', 'Paris', 'Cape Town', 'Sydney',
  'Melbourne', 'Reykjavik', 'Copenhagen', 'Stockholm', 'Brussels', 'Vienna',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- env + db

function readEnv() {
  const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function fetchCities() {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env');

  const names = CITY_NAMES.map((n) => `"${n}"`).join(',');
  const q =
    `${url}/rest/v1/cities?select=name,slug,latitude,longitude,population` +
    `&name=in.(${encodeURIComponent(names)})&slug=not.like.tmp-*`;
  const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`cities lookup failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();

  // Several DB rows can share a whitelist name (Berlin DE vs Berlin US) — keep
  // the most populous, exactly as fetchTrendingCities does.
  const byName = new Map();
  for (const r of rows) {
    if (r.latitude == null || r.longitude == null || !r.slug) continue;
    const cur = byName.get(r.name);
    if (!cur || (r.population ?? 0) > (cur.population ?? 0)) byName.set(r.name, r);
  }
  const ordered = [];
  for (const name of CITY_NAMES) {
    const row = byName.get(name);
    if (row) ordered.push(row);
    else log(`  ! ${name}: no city row with coordinates — skipped`);
  }
  return ordered;
}

// ---------------------------------------------------------------- overpass

/**
 * One mode at a time — the combined query is heavy enough to 504.
 *
 * Responses are cached on disk so re-running while tuning the simplification
 * costs Overpass nothing. Delete `scripts/output/.overpass-cache/` to refetch.
 */
async function fetchRoutes(lat, lon, mode, slug) {
  const cacheFile = resolve(CACHE_DIR, `${slug}-${mode}.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8'));

  const query =
    `[out:json][timeout:180];` +
    `rel(around:${SEARCH_RADIUS_M},${lat},${lon})` +
    `["type"="route"]["route"="${mode}"];` +
    `out geom;`;

  let lastErr;
  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length * 2; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.ok) {
        const json = await res.json();
        // Overpass answers 200 with an empty element list and a `remark` when a
        // query times out or runs out of memory. Madrid, Paris, Mexico City and
        // San Francisco all cached as "no metro" on the first run because of
        // this — an empty 200 is a FAILURE here, not an answer.
        if (json.remark) {
          lastErr = new Error(`overpass remark @ ${new URL(endpoint).host}: ${json.remark}`);
          await sleep(SLEEP_MS * (1 + attempt));
          continue;
        }
        const elements = json.elements || [];
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(cacheFile, JSON.stringify(elements));
        return elements;
      }
      lastErr = new Error(`overpass ${res.status} @ ${new URL(endpoint).host}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(SLEEP_MS * (1 + attempt));
  }
  throw lastErr;
}

/**
 * Stitch a relation's way members into one polyline. Members arrive in travel
 * order but individual ways can be digitised either way round, so each way is
 * flipped when its tail is closer to the running end than its head.
 */
function assemble(rel) {
  const ways = (rel.members || []).filter(
    (m) => m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length > 1 &&
      !/^(stop|platform)/.test(m.role || ''),
  );
  const out = [];
  for (const w of ways) {
    let pts = w.geometry.map((p) => [p.lon, p.lat]);
    if (out.length) {
      const end = out[out.length - 1];
      const dHead = dist2(end, pts[0]);
      const dTail = dist2(end, pts[pts.length - 1]);
      if (dTail < dHead) pts = pts.reverse();
      pts = pts.slice(1);
    }
    out.push(...pts);
  }
  return out;
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// ---------------------------------------------------------------- geometry

/** Local equirectangular metres about (lat0, lon0). y grows southward (screen-up). */
function project(lonlat, lat0, lon0) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return lonlat.map(([lon, lat]) => [
    (lon - lon0) * k * 111320,
    -(lat - lat0) * 110540,
  ]);
}

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/**
 * Length of the parts that actually serve the city, i.e. within CORE_RADIUS_M
 * of the city point. Raw length ranks a suburban orbital above every central
 * line — Madrid led with L12 (MetroSur, a ring 15 km south) drawn as a hook
 * detached from the rest of the diagram.
 */
function coreLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i][0] + pts[i - 1][0]) / 2;
    const my = (pts[i][1] + pts[i - 1][1]) / 2;
    if (Math.hypot(mx, my) <= CORE_RADIUS_M) {
      L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
  }
  return L;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts.slice();
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [
    ...douglasPeucker(pts.slice(0, idx + 1), tol).slice(0, -1),
    ...douglasPeucker(pts.slice(idx), tol),
  ];
}

/** Binary-search the tolerance so every line lands inside the point budget. */
function simplifyToBudget(pts) {
  let lo = 1;
  let hi = Math.max(polyLength(pts) / 4, 100);
  let best = douglasPeucker(pts, hi);
  for (let i = 0; i < 40 && hi - lo > 1; i++) {
    const mid = (lo + hi) / 2;
    const s = douglasPeucker(pts, mid);
    if (s.length > MAX_POINTS) lo = mid;
    else { hi = mid; best = s; }
  }
  if (best.length < MIN_POINTS) {
    // Overshot into a straight stub — back off until it has some shape again.
    for (let t = hi; t > 1; t /= 1.5) {
      const s = douglasPeucker(pts, t);
      if (s.length >= MIN_POINTS && s.length <= MAX_POINTS) return s;
    }
  }
  return best;
}

const SQRT2 = Math.SQRT2;
/** The eight octilinear unit directions, screen-space. */
const DIRS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
].map(([x, y]) => {
  const l = Math.hypot(x, y);
  return { sx: x, sy: y, ux: x / l, uy: y / l, diagonal: x !== 0 && y !== 0 };
});

function snapDir(dx, dy) {
  let best = DIRS[0];
  let bestDot = -Infinity;
  const l = Math.hypot(dx, dy) || 1;
  for (const d of DIRS) {
    const dot = (dx / l) * d.ux + (dy / l) * d.uy;
    if (dot > bestDot) { bestDot = dot; best = d; }
  }
  return best;
}

/**
 * Walk the polyline snapping every segment to the nearest 45° heading, in
 * INTEGER lattice steps. `scale` converts metres to lattice units.
 *
 * Returns integer points, or null when the line collapses to nothing.
 */
function octilinearize(pts, scale) {
  const steps = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i][0] - pts[i - 1][0]) * scale;
    const dy = (pts[i][1] - pts[i - 1][1]) * scale;
    const dir = snapDir(dx, dy);
    // Length along the snapped heading, in lattice steps. A diagonal step of k
    // spans k*sqrt(2), so k is the axis component either way.
    const along = dx * dir.ux + dy * dir.uy;
    const k = Math.round(Math.max(0, along) / (dir.diagonal ? SQRT2 : 1));
    if (k > 0) steps.push({ dir, k });
  }
  // Fold consecutive same-heading steps so a straight run is one segment.
  const folded = [];
  for (const s of steps) {
    const prev = folded[folded.length - 1];
    if (prev && prev.dir === s.dir) prev.k += s.k;
    else folded.push({ dir: s.dir, k: s.k });
  }
  if (!folded.length) return null;

  const out = [[0, 0]];
  for (const { dir, k } of folded) {
    const [x, y] = out[out.length - 1];
    out.push([x + dir.sx * k, y + dir.sy * k]);
  }
  return out;
}

/** Rigid translation so a snapped line sits where the true line sits. */
function recentre(snapped, original, scale) {
  const cx = original.reduce((a, p) => a + p[0], 0) / original.length;
  const cy = original.reduce((a, p) => a + p[1], 0) / original.length;
  const sx = snapped.reduce((a, p) => a + p[0], 0) / snapped.length;
  const sy = snapped.reduce((a, p) => a + p[1], 0) / snapped.length;
  const dx = Math.round(cx * scale - sx);
  const dy = Math.round(cy * scale - sy);
  return snapped.map(([x, y]) => [x + dx, y + dy]);
}

function bbox(lines) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pts of lines) for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Fit the whole network into the viewBox. Scale is chosen BEFORE snapping (the
 * lattice has to be in final units or rounding would break octilinearity), so
 * this searches for the largest scale whose snapped result still fits.
 */
/**
 * Per-line nudges so trunk-sharing lines read as parallel tracks instead of
 * hiding under one another. New York's R/N/F/M share Broadway and 6th Avenue,
 * so after snapping they landed on identical pixels and only the last color
 * drawn was visible.
 *
 * Two properties are load-bearing. An INTEGER translation preserves
 * octilinearity exactly, so nudging cannot break the 45° invariant. And no
 * difference between two offsets is axis-aligned or diagonal, so no pair of
 * lines can re-converge along any of the eight headings they are allowed to
 * run in.
 */
const LINE_OFFSETS = [
  [0, 0],
  [4, 1],
  [-2, 4],
  [3, -4],
];

function snapAll(projectedLines, scale) {
  const snapped = projectedLines.map((pts, i) => {
    const s = octilinearize(pts, scale);
    if (!s) return null;
    const [ox, oy] = LINE_OFFSETS[i % LINE_OFFSETS.length];
    return recentre(s, pts, scale).map(([x, y]) => [x + ox, y + oy]);
  });
  if (snapped.some((s) => s === null)) return null;
  const b = bbox(snapped);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (w > VIEW_W - 2 * PAD || h > VIEW_H - 2 * PAD) return null;
  return { snapped, b, w, h };
}

function layout(projectedLines) {
  const raw = bbox(projectedLines);
  const spanX = Math.max(raw.maxX - raw.minX, 1);
  const spanY = Math.max(raw.maxY - raw.minY, 1);
  const guess = Math.min((VIEW_W - 2 * PAD) / spanX, (VIEW_H - 2 * PAD) / spanY);

  // Snapping SHRINKS a network — each segment keeps only its component along
  // the snapped heading — so the scale derived from the raw bounding box always
  // under-fills, sometimes badly (Sydney sat at ~40% of the box). Find the
  // largest scale that still fits rather than trusting the estimate.
  let best = null;
  let scale = guess;
  for (let i = 0; i < 60; i++) {
    const fit = snapAll(projectedLines, scale);
    if (fit) { best = fit; scale *= 1.06; }
    else if (best) break;
    else scale *= 0.85; // nothing has fitted yet — the guess was too generous
  }
  if (!best) return null;

  const dx = Math.round(PAD + (VIEW_W - 2 * PAD - best.w) / 2 - best.b.minX);
  const dy = Math.round(PAD + (VIEW_H - 2 * PAD - best.h) / 2 - best.b.minY);
  return best.snapped.map((pts) => pts.map(([x, y]) => [x + dx, y + dy]));
}

/**
 * The busiest shared vertex — where the most OTHER lines pass nearby. Falls
 * back to the flagship line's middle vertex. Always an actual vertex, so the
 * station ring provably sits on a track.
 */
function pickInterchange(lines) {
  let best = null;
  let bestScore = -1;
  lines.forEach((pts, li) => {
    for (const p of pts) {
      let score = 0;
      lines.forEach((other, oi) => {
        if (oi === li) return;
        if (other.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= 6)) score++;
      });
      if (score > bestScore) { bestScore = score; best = p; }
    }
  });
  if (bestScore > 0 && best) return { x: best[0], y: best[1] };
  const flagship = lines[0];
  const mid = flagship[Math.floor(flagship.length / 2)];
  return { x: mid[0], y: mid[1] };
}

const toPath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');

// ---------------------------------------------------------------- per city

/**
 * Lines that do not carry passengers yet. OSM keeps proposed and under-
 * construction routes tagged `route=subway`, so without this Paris leads with
 * the unbuilt Grand Paris Express orbital and Tel Aviv publishes two light-rail
 * lines that do not exist — a diagram claiming a city has transit it doesn't.
 */
function isUnbuilt(tags = {}) {
  if (/^(proposed|construction|planned|abandoned|disused)$/i.test(tags.state || '')) return true;
  if (tags.construction || tags.proposed || tags['proposed:route']) return true;
  return /^(construction|proposed)$/i.test(tags.railway || '');
}

/** Collapse a mode's relations into one polyline per line identity. */
function groupLines(elements, city) {
  const lines = new Map();
  for (const rel of elements) {
    if (isUnbuilt(rel.tags)) continue;
    const pts = assemble(rel);
    if (pts.length < 3) continue;
    // `<F>` is the New York F express — a variant of F, not a fifth line.
    // Angle brackets and a trailing express marker collapse into the base ref
    // so one line cannot take two of the four track colors.
    const key = (rel.tags?.ref || rel.tags?.name || String(rel.id))
      .trim()
      .replace(/^[<(]|[>)]$/g, '')
      .trim();
    const projected = project(pts, city.latitude, city.longitude);
    const len = coreLength(projected) || polyLength(projected);
    const cur = lines.get(key);
    // Directional variants of one line: keep the longest.
    if (!cur || len > cur.len) lines.set(key, { ref: key, len, pts: projected });
  }
  return lines;
}

async function buildCity(city) {
  // Ask mode by mode and stop at the first real network — a city with a metro
  // never pays for its tram query, which is the expensive one.
  let chosen = null;
  let fallback = null;
  for (const mode of MODES) {
    const lines = groupLines(await fetchRoutes(city.latitude, city.longitude, mode, city.slug), city);
    if (lines.size >= MIN_LINES_FOR_MODE) { chosen = { mode, lines }; break; }
    if (!fallback && lines.size >= 1) fallback = { mode, lines };
    await sleep(SLEEP_MS);
  }
  chosen = chosen || fallback;
  // A single line is not a network. Cape Town's only `route=tram` relation is
  // the 1 km Century City shuttle; drawn alone and scaled to fill the card it
  // would read as a metro the city does not have. Those cities keep the
  // template line instead.
  if (!chosen || chosen.lines.size < MIN_LINES_FOR_MODE) return null;

  const ranked = [...chosen.lines.values()].sort((a, b) => b.len - a.len).slice(0, MAX_LINES);
  const simplified = ranked.map((l) => ({ ...l, pts: simplifyToBudget(l.pts) }));
  const placed = layout(simplified.map((l) => l.pts));
  if (!placed) return null;

  const lines = placed
    .map((pts, i) => ({ track: TRACKS[i], ref: simplified[i].ref, d: toPath(pts) }))
    .filter((l, i) => placed[i].length >= 2);
  if (!lines.length) return null;

  return {
    slug: city.slug,
    name: city.name,
    mode: chosen.mode,
    lineCount: chosen.lines.size,
    lines,
    interchange: pickInterchange(placed),
  };
}

// ---------------------------------------------------------------- emitters

const TRACK_HEX = { pink: '#FF1F8F', blue: '#00B4E6', green: '#2BE05A', yellow: '#FFD500' };

function contactSheet(cities) {
  const cards = cities.map((c) => {
    const paths = c.lines
      .map(
        (l) =>
          `<path d="${l.d}" fill="none" stroke="${TRACK_HEX[l.track]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join('');
    return `<figure>
      <svg viewBox="0 0 ${VIEW_W} ${VIEW_H}">${paths}
        <circle cx="${c.interchange.x}" cy="${c.interchange.y}" r="6" fill="#FAFAF5" stroke="#111" stroke-width="3"/>
      </svg>
      <figcaption><b>${c.name}</b><br>${c.mode} · ${c.lines.length}/${c.lineCount} lines<br>
      <small>${c.lines.map((l) => l.ref).join(' · ')}</small></figcaption>
    </figure>`;
  });
  return `<!doctype html><meta charset="utf-8"><title>City transit contact sheet</title>
<style>
  body{background:#FAFAF5;color:#111;font:14px/1.4 system-ui;margin:24px}
  h1{font-size:20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
  figure{margin:0;border:3px solid #111;background:#FAFAF5;padding:12px}
  svg{width:100%;display:block}
  figcaption{margin-top:8px;font-size:12px}
  small{color:#555}
</style>
<h1>City transit diagrams — ${cities.length} cities</h1>
<div class="grid">${cards.join('')}</div>`;
}

function dataFile(cities) {
  const entries = cities
    .map(
      (c) => `  '${c.slug}': {
    mode: '${c.mode}',
    lines: [
${c.lines.map((l) => `      { track: '${l.track}', ref: ${JSON.stringify(l.ref)}, d: '${l.d}' },`).join('\n')}
    ],
    interchange: { x: ${c.interchange.x}, y: ${c.interchange.y} },
  },`,
    )
    .join('\n');

  return `import type { Track } from '@/components/transit/routeBulletMap';

/**
 * Octilinear abstractions of real rapid-transit networks, one per featured city.
 *
 * GENERATED by \`node scripts/generate-city-transit-lines.mjs\` from OpenStreetMap
 * route relations. Do not hand-edit — rerun the script. Committed rather than
 * fetched so the homepage costs no network request and every diagram is
 * reviewed once by eye before it ships.
 *
 * Pure data, no JSX, for the reason \`intentMapGeometry.ts\` is: the invariants
 * below become unit tests instead of visual checks
 * (see \`__tests__/cityNetworkGeometry.test.ts\`).
 *
 * THE INVARIANT THAT MAKES THIS WORK: coordinates are INTEGERS on a lattice and
 * every segment is axis-aligned or exactly diagonal, so a diagonal step of k is
 * (±k, ±k). "Every bearing is a multiple of 45°" is therefore exact arithmetic,
 * not a tolerance — and it survives being serialised as text.
 *
 * Track assignment is by LENGTH RANK measured inside the city core (flagship =
 * pink) — ranking on total length puts a suburban orbital first. This is the
 * documented exception to "one accent per context": the four track colors are
 * this artifact's own wayfinding vocabulary, not decoration. See
 * \`docs/design-system/README.md\`.
 *
 * Lines are nudged apart by a few units so trunk-sharing routes read as
 * parallel tracks. The nudges are integers and none of their differences is
 * axis-aligned or diagonal, so neither the 45° invariant nor the separation
 * can be lost.
 *
 * Cities with no usable rail network are absent — \`CityNetwork\` falls back to
 * the bending template line for those.
 *
 * Geometry derived from © OpenStreetMap contributors, ODbL.
 */

export const NETWORK_VIEWBOX = { w: ${VIEW_W}, h: ${VIEW_H} } as const;

export type NetworkMode = 'subway' | 'light_rail' | 'tram';

export interface NetworkLine {
  /** Track color, assigned by core-length rank. */
  track: Track;
  /** The line's own OSM \`ref\` (e.g. "U1") — debugging aid, never rendered. */
  ref: string;
  /** Path data. \`M\`/\`L\` only, integer coordinates. */
  d: string;
}

export interface CityNetwork {
  mode: NetworkMode;
  lines: NetworkLine[];
  /** Busiest shared vertex — always a vertex of one of the lines. */
  interchange: { x: number; y: number };
}

/** Keyed by \`cities.slug\`. */
export const CITY_NETWORKS: Record<string, CityNetwork> = {
${entries}
};
`;
}

// ---------------------------------------------------------------- main

async function main() {
  const cities = (await fetchCities()).filter((c) => !ONLY || c.slug === ONLY || c.name === ONLY);
  log(`Resolved ${cities.length} cities.\n`);

  const built = [];
  for (const city of cities) {
    process.stdout.write(`  ${city.name} … `);
    try {
      const net = await buildCity(city);
      if (!net) log('no usable network');
      else {
        built.push(net);
        log(`${net.mode}, ${net.lines.length}/${net.lineCount} lines [${net.lines.map((l) => l.ref).join(', ')}]`);
      }
    } catch (e) {
      log(`FAILED: ${e.message}`);
    }
    await sleep(SLEEP_MS);
  }

  log(`\n${built.length}/${cities.length} cities have a diagram.`);

  mkdirSync(dirname(SHEET_FILE), { recursive: true });
  writeFileSync(SHEET_FILE, contactSheet(built));
  log(`Contact sheet → ${SHEET_FILE}`);

  if (DRY_RUN) {
    log('--dry-run: data file not written.');
    return;
  }
  writeFileSync(OUT_FILE, dataFile(built));
  log(`Data file → ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
