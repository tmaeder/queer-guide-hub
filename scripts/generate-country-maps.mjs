#!/usr/bin/env node
/**
 * generate-country-maps.mjs
 *
 * Turns every country into a simplified silhouette in the subway visual
 * language: ink outline, land plate, lake water, a yellow station dot on each
 * city we actually cover, and the capital in a callout.
 *
 * One-shot, run by hand. The output is committed and reviewed like source:
 * `public/maps/country/<iso>.json` plus the index at
 * `src/components/geo/countryMapIndex.ts`. Nothing fetches Natural Earth at
 * runtime, and there is no cron.
 *
 *   node scripts/generate-country-maps.mjs --dry-run   # contact sheet only
 *   node scripts/generate-country-maps.mjs             # write the data files
 *   node scripts/generate-country-maps.mjs --svg       # also emit standalone SVGs
 *
 * Flags: --dry-run  --only=<ISO2>  --cached-only  --force  --svg
 *
 * Env: reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env for
 * `cities_directory()` (anon-granted) and the `countries` code↔slug map.
 *
 * Why JSON per country and not one committed TS module like
 * `cityNetworkGeometry.ts`: this is ~1.2 MB of path data across 237 countries.
 * A TS module would land in the JS bundle that `check-bundle-shape.mjs` gates.
 * Static files under `public/` cost the bundle nothing and are CDN-cached, and
 * the component renders them as INLINE svg so the viewer's `data-theme` toggle
 * still wins — an <img> can only see `prefers-color-scheme`.
 *
 * Dot safety, load-bearing: the dots are CITIES, never venues. City-level
 * presence is already public (`cities_directory()` is anon-granted and cities
 * are in the sitemap). Venue coordinates in criminalizing countries are exactly
 * what `venues.safety_gated` + RLS exist to withhold from anonymous readers,
 * and a static committed asset would route around that layer permanently.
 *
 * Boundaries and lakes: Natural Earth 50m (public domain).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/maps/country');
const INDEX_FILE = resolve(ROOT, 'src/components/geo/countryMapIndex.ts');
const SHEET_FILE = resolve(ROOT, 'scripts/output/country-contact-sheet.html');
const CACHE_DIR = resolve(ROOT, 'scripts/output/.natural-earth');
const SVG_DIR = resolve(ROOT, 'scripts/output/country-svg');

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).toUpperCase();
const CACHED_ONLY = process.argv.includes('--cached-only');
const FORCE = process.argv.includes('--force');
const WRITE_SVG = process.argv.includes('--svg');

// ---------------------------------------------------------------- tunables

const VIEW_W = 1000;
const VIEW_H = 700;
const PAD = 56;
/** Simplification tolerance in OUTPUT PIXELS, so on-page detail is constant
 *  however large the country is in degrees. Douglas-Peucker in projected
 *  space, never in lon/lat. */
const TOLERANCE = 1.1;
/** Drop a polygon smaller than this share of the country's largest. Keeps a
 *  silhouette from being 40 invisible islets wide. */
const SLIVER_SHARE = 0.004;
/** Single-linkage cluster cut. A polygon joins the mainland cluster when its
 *  bbox comes within this many lat-corrected degrees of the cluster's bbox;
 *  the cluster's bbox grows as it absorbs, so an archipelago chains together
 *  (Indonesia, Greece, the Philippines) while a genuinely detached overseas
 *  territory is cut. Without this France frames on French Guiana and
 *  metropolitan France is a thumbnail in the corner. */
const LINK_FLOOR_DEG = 2.5;
const LINK_SHARE = 0.4;
/**
 * A polygon smaller than this share of the largest may JOIN the cluster but may
 * not EXTEND its bbox, so it cannot act as a stepping stone.
 *
 * Without it, single linkage walked Norway out to Svalbard via Bjørnøya — a
 * 178 km² rock at 74.5°N, close enough to the mainland to be absorbed, which
 * then moved the frontier far enough north that Svalbard's own 5.5° gap fell
 * inside the link. The result framed Norway's mainland into the lower half.
 * Tuning the link distance could not fix that: the bridge is two short hops,
 * not one long one.
 */
const BRIDGE_SHARE = 0.02;
/** Station dots per country, ranked by how much we cover there. */
const MAX_DOTS = 12;

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const NE_LAYERS = ['ne_50m_admin_0_countries', 'ne_50m_lakes'];

const log = (...a) => console.log('[country-maps]', ...a);

// ---------------------------------------------------------------- inputs

function readEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    const env = {};
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  }
  return {};
}

async function loadLayer(name) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = resolve(CACHE_DIR, `${name}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  if (CACHED_ONLY) throw new Error(`--cached-only but ${name} is not cached`);
  log(`fetching ${name}…`);
  const res = await fetch(`${NE_BASE}/${name}.geojson`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text);
  // An HTTP 200 carrying no features is a failed fetch wearing a success, the
  // same trap the Overpass generator records. Only a validated body is cached.
  if (!Array.isArray(json.features) || json.features.length === 0) {
    throw new Error(`${name}: 200 with no features — not caching`);
  }
  writeFileSync(cached, text);
  return json;
}

/**
 * Top cities per country from `cities_directory()`.
 *
 * Do NOT replace this with a new RPC or a raw `cities` query: the directory is
 * already filtered (no tmp- slugs, no ghost/merged shells, coords present,
 * seo_indexable), already carries lat/lng, and is already ordered
 * `venue_count desc`. It returns jsonb rather than a table on purpose —
 * PostgREST's 1000-row cap silently truncated the RETURNS TABLE version.
 */
async function fetchCityDots() {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    log('WARNING: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — silhouettes only.');
    return { byCode: new Map(), ok: false };
  }
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  const dirRes = await fetch(`${url}/rest/v1/rpc/cities_directory`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  if (!dirRes.ok) throw new Error(`cities_directory: ${dirRes.status} ${await dirRes.text()}`);
  const cities = await dirRes.json();

  // cities_directory keys countries by slug; the geometry is keyed by ISO-2.
  const cRes = await fetch(`${url}/rest/v1/countries?select=code,slug&limit=400`, { headers });
  if (!cRes.ok) throw new Error(`countries: ${cRes.status} ${await cRes.text()}`);
  const slugToCode = new Map();
  for (const c of await cRes.json()) if (c.code && c.slug) slugToCode.set(c.slug, c.code.toUpperCase());

  const byCode = new Map();
  for (const city of cities) {
    const code = slugToCode.get(city.country_slug);
    if (!code || typeof city.latitude !== 'number' || typeof city.longitude !== 'number') continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(city);
  }
  log(`cities_directory: ${cities.length} cities over ${byCode.size} countries`);
  return { byCode, ok: true, countryCodes: [...slugToCode.values()] };
}

// ---------------------------------------------------------------- geometry

const ringsOf = (geom) =>
  geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];

/**
 * Countries spanning ±180 arrive as one cluster near +179 and one near -179.
 * Shift the western half by +360 so the country is continuous, or Russia and
 * Fiji draw as a full-width smear.
 *
 * Returns the shift so cities and lakes get the SAME treatment — the prototype
 * shifted only the land, which is why the United States rendered with the
 * frame in shifted coordinates and every city dot outside it.
 */
function unwrapLon(polys) {
  const lons = polys.flat(2).map((p) => p[0]);
  const spansSeam = lons.some((l) => l > 100) && lons.some((l) => l < -100);
  if (!spansSeam) return false;
  for (const poly of polys) for (const ring of poly) for (const p of ring) if (p[0] < 0) p[0] += 360;
  return true;
}
const applyShift = (lon, shifted) => (shifted && lon < 0 ? lon + 360 : lon);

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a / 2);
}

function bboxOf(poly) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lon, lat] of poly[0]) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

/** Ray-cast point-in-ring, lon/lat space. */
function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Gap between two bboxes in lat-corrected degrees; 0 when they overlap. */
function bboxGap(a, b, k) {
  const dx = Math.max(0, Math.max(a[0] - b[2], b[0] - a[2])) * k;
  const dy = Math.max(0, Math.max(a[1] - b[3], b[1] - a[3]));
  return Math.hypot(dx, dy);
}

/**
 * Keep the mainland cluster, drop detached overseas territory.
 *
 * Single linkage from the largest polygon outward, with the link distance
 * scaled off the GEOMETRIC mean of the cluster's extent rather than its longer
 * side — a max-based radius blows up for an elongated country and would pull
 * Easter Island back into Chile.
 */
function mainlandCluster(polys, k) {
  if (polys.length === 1) return polys;
  const items = polys
    .map((p) => ({ p, a: ringArea(p[0]), box: bboxOf(p) }))
    .sort((x, y) => y.a - x.a);

  const kept = [items[0]];
  let box = [...items[0].box];
  const pool = items.slice(1);
  const bridgeFloor = items[0].a * BRIDGE_SHARE;

  for (let grew = true; grew; ) {
    grew = false;
    const span = Math.sqrt(Math.max((box[2] - box[0]) * k, 0.01) * Math.max(box[3] - box[1], 0.01));
    const link = Math.max(LINK_FLOOR_DEG, LINK_SHARE * span);
    for (let i = pool.length - 1; i >= 0; i--) {
      if (bboxGap(pool[i].box, box, k) > link) continue;
      // Only a substantial landmass moves the frontier. See BRIDGE_SHARE.
      if (pool[i].a >= bridgeFloor) {
        const [w, s, e, n] = pool[i].box;
        box = [Math.min(box[0], w), Math.min(box[1], s), Math.max(box[2], e), Math.max(box[3], n)];
      }
      kept.push(pool[i]);
      pool.splice(i, 1);
      grew = true;
    }
  }

  const biggest = kept[0].a;
  return kept.filter((it) => it.a > biggest * SLIVER_SHARE).map((it) => it.p);
}

/**
 * Per-country equirectangular with a cos(lat0) x-correction. Every country
 * gets its own frame, so this keeps each shape true without paying the global
 * Mercator area distortion that makes Greenland a continent.
 */
function makeProjector(polys) {
  const pts = polys.flat(2);
  const lat0 = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  const k = Math.max(Math.cos((lat0 * Math.PI) / 180), 0.15);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [lon, lat] of pts) {
    const x = lon * k, y = -lat;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const s = Math.min((VIEW_W - 2 * PAD) / (maxX - minX || 1), (VIEW_H - 2 * PAD) / (maxY - minY || 1));
  const ox = (VIEW_W - (maxX - minX) * s) / 2 - minX * s;
  const oy = (VIEW_H - (maxY - minY) * s) / 2 - minY * s;
  const project = ([lon, lat]) => [lon * k * s + ox, -lat * s + oy];
  project.k = k;
  project.bbox = [minX / k, -maxY, maxX / k, -minY];
  return project;
}

/** Douglas-Peucker on already-projected points. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const segDistSq = (p, a, b) => {
    let [x, y] = a;
    const dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) [x, y] = b;
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };
  const t2 = tol * tol;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let idx = -1, maxD = t2;
    for (let i = first + 1; i < last; i++) {
      const d = segDistSq(pts[i], pts[first], pts[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0) { keep[idx] = true; stack.push([first, idx], [idx, last]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const r1 = (n) => Math.round(n * 10) / 10;

function ringPath(ring, project, tol) {
  const pts = simplify(ring.map(project), tol);
  if (pts.length < 3) return '';
  return `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;
}

// ---------------------------------------------------------------- build

function buildCountry(feature, lakes, dotsForCode) {
  const props = feature.properties;
  const iso = (props.ISO_A2_EH && props.ISO_A2_EH !== '-99' ? props.ISO_A2_EH : props.ISO_A2) || '';
  if (!iso || iso === '-99') return null;

  const polys = structuredClone(ringsOf(feature.geometry));
  if (!polys.length) return null;
  const shifted = unwrapLon(polys);

  const pre = makeProjector(polys);
  const kept = mainlandCluster(polys, pre.k);
  const project = makeProjector(kept);

  // One <path> per polygon. Concatenating every polygon into a single
  // fill-rule="evenodd" path makes overlapping landmasses cancel and punch
  // holes in the fill — Brazil's north went transparent that way.
  const land = kept
    .map((poly) =>
      poly.map((ring, i) => ringPath(ring, project, i === 0 ? TOLERANCE : TOLERANCE * 1.6)).join(''),
    )
    .filter(Boolean);
  if (!land.length) return null;

  // Slack is a share of the country's OWN span, never an absolute number of
  // degrees. A flat 0.5° is border tolerance for Switzerland and half a frame
  // for Vatican City, whose geometry spans 0.006° — our stored coordinates for
  // it sit ~300 m off the Natural Earth polygon, which is nothing anywhere else
  // and put its only dot at x=1515 in a 1000-wide frame.
  const [w, s, e, n] = project.bbox;
  const slackLon = (e - w) * 0.05;
  const slackLat = (n - s) * 0.05;
  const inFrame = (lon, lat) =>
    lon >= w - slackLon && lon <= e + slackLon && lat >= s - slackLat && lat <= n + slackLat;

  // A lake is kept when at least one of its own vertices falls inside this
  // country's land, not merely inside the frame. Framing alone scattered
  // Canada's Great Bear, Great Slave and Winnipeg across the middle of the US
  // map as unexplained blue specks. One vertex rather than the centroid, so a
  // border lake survives — Geneva and Constance are half-foreign and are
  // exactly the lakes the reference silhouette shows.
  const outerRings = kept.map((poly) => poly[0]);
  const touchesLand = (ring) =>
    ring.some(([lon, lat]) => outerRings.some((outer) => ringContains(outer, lon, lat)));

  const lakePaths = lakes.features
    .map((f) =>
      ringsOf(f.geometry).map((poly) => poly[0].map(([lon, lat]) => [applyShift(lon, shifted), lat])),
    )
    .filter((rings) => {
      const first = rings[0]?.[0];
      if (!first || !inFrame(first[0], first[1])) return false;
      return rings.some(touchesLand);
    })
    .map((rings) => rings.map((ring) => ringPath(ring, project, TOLERANCE * 0.7)).join(''))
    .filter(Boolean)
    .join('');

  // Ordered venue_count desc by cities_directory; the capital is pinned first
  // so it survives the slice and owns the callout.
  const pool = (dotsForCode ?? []).filter((c) =>
    inFrame(applyShift(c.longitude, shifted), c.latitude),
  );
  const capital = pool.find((c) => c.is_capital === true) ?? null;
  const ordered = capital ? [capital, ...pool.filter((c) => c !== capital)] : pool;

  const dots = ordered
    .slice(0, MAX_DOTS)
    .map((c) => {
      const [x, y] = project([applyShift(c.longitude, shifted), c.latitude]);
      const dot = { x: r1(x), y: r1(y) };
      if (c === capital) dot.c = 1;
      return dot;
    })
    // Belt and braces after the lon/lat slack above: a dot outside the viewBox
    // is either invisible or, worse, drawn over the frame's own border. The
    // guarantee lives here so it holds however the slack is later tuned.
    .filter((d) => d.x >= 0 && d.x <= VIEW_W && d.y >= 0 && d.y <= VIEW_H);

  const pinned = dots.find((d) => d.c === 1);
  const label = capital && pinned ? { t: capital.name, x: pinned.x, y: pinned.y } : null;

  return {
    iso,
    name: props.NAME_EN ?? props.NAME,
    area: ringArea(kept[0][0]),
    data: { iso, name: props.NAME_EN ?? props.NAME, w: VIEW_W, h: VIEW_H, land, lakes: lakePaths || null, dots, label },
  };
}

// ---------------------------------------------------------------- output

/** Standalone SVG, for design and marketing. Literal colours are correct here
 *  and only here: this file leaves the app and has no stylesheet to inherit. */
function standaloneSvg(d) {
  const INK = '#111111', LAND = '#EDEDE6', WATER = '#A6DCEC', STATION = '#FFD500';
  const land = d.land
    .map((p) => `<path d="${p}" fill="${LAND}" stroke="${INK}" stroke-width="3.5" fill-rule="evenodd"/>`)
    .join('');
  const water = d.lakes ? `<path d="${d.lakes}" fill="${WATER}" fill-rule="evenodd"/>` : '';
  const dots = d.dots
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.c ? 11 : 9}" fill="${STATION}" stroke="${INK}" stroke-width="1.5"/>`)
    .join('');
  let label = '';
  if (d.label) {
    const bw = Math.max(96, d.label.t.length * 16 + 36), bh = 50;
    const bx = Math.min(Math.max(d.label.x - bw / 2, 10), d.w - bw - 10);
    const by = Math.max(d.label.y - bh - 26, 10);
    const tx = Math.min(Math.max(d.label.x, bx + 20), bx + bw - 20);
    label =
      `<path d="M${r1(tx - 11)} ${r1(by + bh - 1)}L${r1(tx + 11)} ${r1(by + bh - 1)}L${r1(d.label.x)} ${r1(d.label.y)}Z" fill="${STATION}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<rect x="${r1(bx)}" y="${r1(by)}" width="${r1(bw)}" height="${bh}" rx="10" fill="${STATION}" stroke="${INK}" stroke-width="1.5"/>` +
      `<text x="${r1(bx + bw / 2)}" y="${r1(by + 34)}" text-anchor="middle" font-family="Anton, 'Arial Black', sans-serif" font-size="25" fill="${INK}">${d.label.t.toUpperCase()}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}" role="img" aria-label="${d.name}"><title>${d.name}</title><g stroke-linejoin="round">${land}${water}${dots}${label}</g></svg>`;
}

function contactSheet(built, missing) {
  const cells = built
    .map(
      (b) =>
        `<figure><div>${standaloneSvg(b.data)}</div><figcaption>${b.iso} · ${b.name} · ${b.data.dots.length} dots</figcaption></figure>`,
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>Country maps</title><style>
body{margin:0;background:#FAFAF5;font:12px/1.4 system-ui;padding:16px;color:#111}
h1{font:700 16px system-ui;margin:0 0 4px}p{margin:0 0 16px;color:#555}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
figure{margin:0;background:#fff;border-radius:14px;padding:6px;box-shadow:0 10px 24px rgba(17,17,17,.06)}
svg{width:100%;height:auto;display:block}figcaption{font-weight:700;padding:3px 5px}
</style><h1>${built.length} country maps</h1><p>${missing.length ? `No geometry for: ${missing.join(', ')}` : 'Every country code resolved.'}</p><main>${cells}</main>`;
}

function indexFile(built) {
  return `/**
 * GENERATED by \`node scripts/generate-country-maps.mjs\`. Do not hand-edit —
 * rerun the script.
 *
 * The index only, never the geometry: the 237 silhouettes are ~1.2 MB of path
 * data and live as static JSON under \`public/maps/country/\` so they cost the
 * JS bundle nothing. \`CountryMap\` fetches one on demand.
 *
 * The predicate ships WITH the index rather than inside the component for the
 * reason \`hasCityNetwork\` does: a surface must be able to ask whether a map
 * exists before it commits layout to one.
 *
 * Boundaries and lakes: Natural Earth 50m (public domain).
 */

/** One country silhouette, as fetched from \`/maps/country/<iso>.json\`. */
export interface CountryMapData {
  /** ISO-3166 alpha-2, uppercase. */
  iso: string;
  name: string;
  /** viewBox width / height. */
  w: number;
  h: number;
  /** One entry per landmass polygon — never concatenate them into one path. */
  land: string[];
  lakes: string | null;
  dots: { x: number; y: number; /** 1 on the capital. */ c?: number }[];
  label: { t: string; x: number; y: number } | null;
}

/** ISO-2 codes with committed geometry. */
export const COUNTRY_MAP_CODES: readonly string[] = [
${built.map((b) => `  '${b.iso}',`).join('\n')}
];

const CODE_SET = new Set(COUNTRY_MAP_CODES);

export function hasCountryMap(code: string | null | undefined): boolean {
  return !!code && CODE_SET.has(code.toUpperCase());
}

export function countryMapUrl(code: string): string {
  return \`/maps/country/\${code.toLowerCase()}.json\`;
}
`;
}

// ---------------------------------------------------------------- main

async function main() {
  const [countries, lakes] = await Promise.all(NE_LAYERS.map(loadLayer));
  const { byCode, countryCodes } = await fetchCityDots();

  const seen = new Map();
  for (const feature of countries.features) {
    const p = feature.properties;
    const iso = (p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2) || '';
    if (!iso || iso === '-99') continue;
    // Natural Earth carries Australia three times (mainland plus two territory
    // features). Keep the largest feature per ISO code.
    const prev = seen.get(iso);
    const area = ringsOf(feature.geometry).reduce((sum, poly) => sum + ringArea(poly[0]), 0);
    if (!prev || area > prev.area) seen.set(iso, { feature, area });
  }

  const wanted = [...seen.keys()].sort().filter((iso) => !ONLY || iso === ONLY);
  if (ONLY && !wanted.length) throw new Error(`--only=${ONLY} matched no country`);

  const built = [];
  for (const iso of wanted) {
    const rec = buildCountry(seen.get(iso).feature, lakes, byCode.get(iso));
    if (rec) built.push(rec);
    else log(`skipped ${iso}: no usable geometry`);
  }
  log(`built ${built.length} of ${wanted.length}`);

  // Coverage is NOT 100% and has to say so out loud rather than silently
  // shipping a shorter list: Somaliland and Northern Cyprus carry no ISO code
  // in Natural Earth at all, and micro-territories can be absent outright.
  const missing = (countryCodes ?? [])
    .filter((c, i, a) => a.indexOf(c) === i && !seen.has(c))
    .sort();
  if (missing.length) log(`NO GEOMETRY for ${missing.length} countries.code: ${missing.join(', ')}`);
  else if (countryCodes) log('every countries.code resolved to geometry');

  mkdirSync(dirname(SHEET_FILE), { recursive: true });
  writeFileSync(SHEET_FILE, contactSheet(built, missing));
  log(`Contact sheet → ${SHEET_FILE}`);

  if (DRY_RUN) {
    log('--dry-run: data files not written.');
    return;
  }

  // The output directory is replaced wholesale, so a run that produced less
  // than what is committed is a DELETE of the difference. The test is "did
  // this run SHRINK the set", never a yield rate — yield is meaningless when
  // the input list itself can legitimately grow.
  const committed = existsSync(OUT_DIR)
    ? readdirSync(OUT_DIR).filter((f) => f.endsWith('.json')).length
    : 0;
  if (ONLY || built.length < committed * 0.9) {
    log(
      `REFUSING to write: ${built.length} map(s) against ${committed} already committed` +
        `${ONLY ? ' (--only run)' : ''}. Re-run over every country, or pass --force.`,
    );
    if (!FORCE) return;
  }

  if (existsSync(OUT_DIR) && !ONLY) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const b of built) {
    writeFileSync(resolve(OUT_DIR, `${b.iso.toLowerCase()}.json`), JSON.stringify(b.data));
  }
  log(`${built.length} map(s) → ${OUT_DIR}`);

  if (!ONLY) {
    writeFileSync(INDEX_FILE, indexFile(built));
    log(`Index → ${INDEX_FILE}`);
  }

  if (WRITE_SVG) {
    mkdirSync(SVG_DIR, { recursive: true });
    for (const b of built) writeFileSync(resolve(SVG_DIR, `${b.iso.toLowerCase()}.svg`), standaloneSvg(b.data));
    log(`${built.length} standalone SVG(s) → ${SVG_DIR}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
