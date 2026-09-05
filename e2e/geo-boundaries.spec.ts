import { test, expect, type APIRequestContext } from '@playwright/test';

// A coordinate must be inside the place it claims to be in.
//
// Until 20270501174244 there was no boundary geometry in this database at all:
// PostGIS was installed and all three geometry columns were 100% NULL, so every
// geo check compared a coordinate to the CENTROID of its claimed place. That
// cannot do the job — `city_geo_conflicts()` ranks Honolulu, Réunion, Guam and
// Bonaire (all correctly filed) above "Concord" filed under Czech Republic,
// which is a real error at 35.41/-80.59.
//
// Read through the ANON PostgREST role — the same role the browser uses — so
// this asserts what a user can actually be served.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

async function rpc<T>(request: APIRequestContext, fn: string, body: unknown = {}): Promise<T> {
  const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}`, 'Content-Type': 'application/json' },
    data: body,
  });
  expect(res.ok(), `rpc ${fn} -> HTTP ${res.status()}`).toBeTruthy();
  return res.json();
}

// ── positive controls ────────────────────────────────────────────────────────
// "Zero containment violations" also passes over an EMPTY boundary table, where
// every coordinate resolves to no country and the whole corpus is classified
// `offshore`. These tests are what stop that from reading as a clean corpus.

test('boundary geometry is actually loaded', async ({ request }) => {
  const rows = await rest<{ iso_a2: string }>(
    request,
    'geo_boundaries?select=iso_a2&boundary_kind=eq.country&iso_a2=not.is.null&limit=400',
  );
  // 258 admin-0 features, 245 with a usable ISO-2 after CN-TW normalisation.
  expect(rows.length, 'geo_boundaries is empty or unloaded — every containment verdict would be meaningless').toBeGreaterThan(200);
});

test('microstates survived the load', async ({ request }) => {
  // These are 0.2–1.6 KB of geometry each and are exactly what a simplification
  // pass deletes. If any is missing, every venue in it reads as "offshore" and
  // the validator invents a defect class. Named individually so a future
  // "optimisation" cannot quietly reintroduce that.
  const wanted = ['MC', 'VA', 'NR', 'SM', 'TV', 'LI', 'MT', 'SG'];
  const rows = await rest<{ iso_a2: string }>(
    request,
    `geo_boundaries?select=iso_a2&boundary_kind=eq.country&iso_a2=in.(${wanted.join(',')})`,
  );
  const got = new Set(rows.map((r) => r.iso_a2));
  for (const c of wanted) expect(got.has(c), `microstate ${c} is missing from geo_boundaries`).toBeTruthy();
});

test('Taiwan is filed under TW, not Natural Earth’s CN-TW', async ({ request }) => {
  // 121 venues and 30 events hang off TW. Without the normalisation every one
  // of them reads as a country mismatch on the first sweep.
  const tw = await rest<{ iso_a2: string }>(request, 'geo_boundaries?select=iso_a2&iso_a2=eq.TW&boundary_kind=eq.country');
  expect(tw.length, 'Taiwan absent — the CN-TW mapping regressed').toBeGreaterThan(0);
  const raw = await rest<{ iso_a2: string }>(request, 'geo_boundaries?select=iso_a2&iso_a2=eq.CN-TW');
  expect(raw.length, 'raw CN-TW leaked into geo_boundaries').toBe(0);
});

// ── the equivalence that kills the old false-positive class ──────────────────

test('territories are equivalent to their sovereign', async ({ request }) => {
  // Every one of these was a false positive in city_geo_conflicts(). If the
  // parent table is unpopulated they all come back as country mismatches.
  const parents = await rest<{ child_code: string; parent_code: string }>(
    request,
    'geo_country_parent?select=child_code,parent_code',
  );
  expect(parents.length, 'geo_country_parent is empty — sovereignty is unrepresentable and territories will false-positive').toBeGreaterThan(0);

  const map = new Map(parents.map((p) => [p.child_code, p.parent_code]));
  // Territories with their OWN polygon get a parent from Natural Earth SOV_A3.
  for (const [child, parent] of [['GU', 'US'], ['PR', 'US'], ['HK', 'CN']] as const) {
    expect(map.get(child), `${child} must resolve to ${parent}`).toBe(parent);
  }
  // Territories with NO polygon get one from centroid containment.
  for (const child of ['RE', 'MQ', 'GP', 'BQ']) {
    expect(map.has(child), `${child} has no polygon and no derived parent — its venues will false-positive`).toBeTruthy();
  }
});

test('geo_countries_equivalent is symmetric and does not over-match', async ({ request }) => {
  const t = async (a: string, b: string) => rpc<boolean>(request, 'geo_countries_equivalent', { a, b });
  expect(await t('US', 'GU'), 'Guam venue filed US must not be a mismatch').toBe(true);
  expect(await t('GU', 'US'), 'equivalence must be symmetric').toBe(true);
  expect(await t('FR', 'RE'), 'Réunion coordinate landing in France must not be a mismatch').toBe(true);
  expect(await t('US', 'DE'), 'unrelated countries must NOT be equivalent').toBe(false);
  expect(await t('MY', 'GY'), 'Malaysia and Guyana must NOT be equivalent').toBe(false);
});

// ── the actual containment answer ────────────────────────────────────────────

test('every country holding content has boundary geometry', async ({ request }) => {
  const stats = await rpc<Record<string, unknown>>(request, 'geo_hygiene_stats');
  expect(Number(stats.boundary_countries), 'no country polygons loaded').toBeGreaterThan(200);
  expect(
    Number(stats.countries_without_geometry),
    'a country holding venues or events has neither its own polygon nor a derived parent — every row under it will be reported as a mismatch that is not one',
  ).toBe(0);
});

test('known-correct places resolve to their own country', async ({ request }) => {
  // The four that the centroid-distance detector ranked as its TOP errors, plus
  // a control that must resolve differently. If containment regresses to
  // distance, the first four break and the last one still passes — which is why
  // the negative control is here.
  const cases: ReadonlyArray<readonly [string, number, number, string]> = [
    ['Honolulu', 21.304547, -157.855676, 'US'],
    ['Saint-Denis, Réunion', -20.8789, 55.4481, 'FR'],
    ['Dededo, Guam', 13.5148408, 144.835525, 'GU'],
    ['Kralendijk, Bonaire', 12.1472869, -68.2740206, 'BQ'],
    ['Taipei', 25.033, 121.5654, 'TW'],
  ];
  for (const [label, lat, lng, expected] of cases) {
    const rows = await rpc<Array<{ iso_a2: string; match_kind: string }>>(request, 'geo_country_at', {
      p_lat: lat,
      p_lng: lng,
    });
    expect(rows.length, `${label}: no containing country`).toBeGreaterThan(0);
    const iso = rows[0].iso_a2;
    const ok = iso === expected || (await rpc<boolean>(request, 'geo_countries_equivalent', { a: iso, b: expected }));
    expect(ok, `${label} resolved to ${iso}, expected ${expected} (or an equivalent)`).toBeTruthy();
  }
});

test('a coordinate in the wrong hemisphere is caught', async ({ request }) => {
  // The negative control for the test above. `Bombay Eats / Bombay Wraps` is
  // filed in Chicago and pinned at -26.02/28.18, which is Johannesburg. If
  // containment says US for this point the check is not doing anything.
  const rows = await rpc<Array<{ iso_a2: string }>>(request, 'geo_country_at', {
    p_lat: -26.0161287,
    p_lng: 28.1829882,
  });
  expect(rows.length, 'Johannesburg resolved to no country').toBeGreaterThan(0);
  expect(rows[0].iso_a2, 'a Johannesburg coordinate must resolve to ZA, not to the venue’s claimed US').toBe('ZA');
});
