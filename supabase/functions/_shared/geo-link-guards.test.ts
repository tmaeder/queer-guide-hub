import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CITY_COORD_MAX_KM,
  cityCoordContradiction,
  cityLinkContradiction,
  distanceKm,
  mergeRoundRobin,
} from './geo-link-guards.ts';

// Real coordinates, so the numbers mean something.
const SPRINGFIELD_MO = { latitude: 37.2089, longitude: -93.2923 };
const SPRINGFIELD_IL = { name: 'Springfield', latitude: 39.7817, longitude: -89.6501 };
const PALM_SPRINGS_CITY = { name: 'Palm Springs', latitude: 33.8303, longitude: -116.5453 };
const VENUE_IN_PALM_SPRINGS = { latitude: 33.8236, longitude: -116.5305 };

Deno.test('distanceKm: known pair is roughly right', () => {
  const km = distanceKm(SPRINGFIELD_MO, SPRINGFIELD_IL);
  assert(km !== null);
  assertAlmostEquals(km, 428, 10);
});

Deno.test('distanceKm: numeric strings are accepted (Postgres numeric arrives as text)', () => {
  const km = distanceKm(
    { latitude: '33.8236', longitude: '-116.5305' },
    { latitude: '33.8303', longitude: '-116.5453' },
  );
  assert(km !== null && km < 2);
});

Deno.test('distanceKm: any missing coordinate yields null, never 0', () => {
  assertEquals(distanceKm({ latitude: null, longitude: 1 }, SPRINGFIELD_IL), null);
  assertEquals(distanceKm(SPRINGFIELD_MO, { latitude: 1, longitude: undefined }), null);
  assertEquals(distanceKm({ latitude: '', longitude: '' }, SPRINGFIELD_IL), null);
  assertEquals(distanceKm({ latitude: 'abc', longitude: 1 }, SPRINGFIELD_IL), null);
});

Deno.test('distanceKm: near-antipodal pair is finite (asin clamp)', () => {
  const km = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
  assert(km !== null && Number.isFinite(km));
  assertAlmostEquals(km, Math.PI * 6371, 1);
});

Deno.test('cityCoordContradiction: a same-name city 428 km away is refused', () => {
  const reason = cityCoordContradiction(SPRINGFIELD_MO, SPRINGFIELD_IL);
  assert(reason !== null);
  assert(reason.includes('Springfield'));
});

Deno.test('cityCoordContradiction: a venue inside its city passes', () => {
  assertEquals(cityCoordContradiction(VENUE_IN_PALM_SPRINGS, PALM_SPRINGS_CITY), null);
});

Deno.test('cityCoordContradiction: fails OPEN without coordinates on either side', () => {
  assertEquals(cityCoordContradiction({ latitude: null, longitude: null }, SPRINGFIELD_IL), null);
  assertEquals(
    cityCoordContradiction(SPRINGFIELD_MO, { name: 'Springfield', latitude: null, longitude: null }),
    null,
  );
});

Deno.test('cityCoordContradiction: the bound is inclusive and is the measured 100 km', () => {
  assertEquals(CITY_COORD_MAX_KM, 100);
  // ~0.9 degrees of latitude is ~100 km: just under and just over.
  const city = { name: 'X', latitude: 0, longitude: 0 };
  assertEquals(cityCoordContradiction({ latitude: 0.89, longitude: 0 }, city), null);
  assert(cityCoordContradiction({ latitude: 0.91, longitude: 0 }, city) !== null);
});

Deno.test('cityLinkContradiction: a country mismatch needs coordinate corroboration', () => {
  const city = { ...PALM_SPRINGS_CITY, country_id: 'US' };
  assert(
    cityLinkContradiction({ latitude: null, longitude: null }, city, 'CA') !== null,
  );
  assertEquals(cityLinkContradiction(VENUE_IN_PALM_SPRINGS, city, 'CA'), null);
});

Deno.test('cityLinkContradiction: same-country matches still fail open without coordinates', () => {
  const city = { ...PALM_SPRINGS_CITY, country_id: 'US' };
  assertEquals(cityLinkContradiction({ latitude: null, longitude: null }, city, 'US'), null);
});

const ids = (...xs: string[]) => xs.map((id) => ({ id }));

Deno.test('mergeRoundRobin: a full first half takes no wrap rows', () => {
  const { rows, cursor } = mergeRoundRobin(ids('c', 'd'), ids('a', 'b'), 2);
  assertEquals(rows.map((r) => r.id), ['c', 'd']);
  assertEquals(cursor, 'd');
});

Deno.test('mergeRoundRobin: a short first half wraps to the start', () => {
  const { rows, cursor } = mergeRoundRobin(ids('y', 'z'), ids('a', 'b', 'c'), 4);
  assertEquals(rows.map((r) => r.id), ['y', 'z', 'a', 'b']);
  assertEquals(cursor, 'b');
});

Deno.test('mergeRoundRobin: a list smaller than the batch is not processed twice', () => {
  // Cursor sits at "a"; the whole list is a, b. First half returns b; the wrap
  // returns a, b again.
  const { rows, cursor } = mergeRoundRobin(ids('b'), ids('a', 'b'), 10);
  assertEquals(rows.map((r) => r.id), ['b', 'a']);
  assertEquals(cursor, 'a');
});

Deno.test('mergeRoundRobin: an empty list persists no cursor', () => {
  assertEquals(mergeRoundRobin([], [], 200), { rows: [], cursor: null });
});

Deno.test('mergeRoundRobin: successive runs visit every row, not the same head', () => {
  // The defect this replaces: an unordered LIMIT re-read the same head forever.
  const all = ids('a', 'b', 'c', 'd', 'e');
  const read = (cursor: string | null, limit: number) => {
    const after = cursor ? all.filter((r) => r.id > cursor).slice(0, limit) : [];
    const start = after.length < limit ? all.slice(0, limit) : [];
    return mergeRoundRobin(after, start, limit);
  };
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let run = 0; run < 3; run++) {
    const r = read(cursor, 2);
    r.rows.forEach((x) => seen.add(x.id));
    cursor = r.cursor;
  }
  assertEquals([...seen].sort(), ['a', 'b', 'c', 'd', 'e']);
});
