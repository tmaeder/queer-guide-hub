import { describe, expect, it } from 'vitest';
import { CITY_NETWORKS, NETWORK_VIEWBOX, type CityNetwork } from '../cityNetworkGeometry';

/**
 * The geometry is machine-generated from OpenStreetMap
 * (`scripts/generate-city-transit-lines.mjs`), so these assertions guard the
 * generator's output rather than a human's typing: a tolerance change or a
 * refactor that quietly breaks octilinearity fails here instead of shipping a
 * card that looks like a GPS trace.
 */

const TRACKS = ['pink', 'blue', 'green', 'yellow'] as const;

function parsePath(d: string): [number, number][] {
  const tokens = d.trim().split(/\s+/);
  const pts: [number, number][] = [];
  for (let i = 0; i < tokens.length; i += 3) {
    const [cmd, x, y] = tokens.slice(i, i + 3);
    expect(cmd, `command in "${d}"`).toBe(i === 0 ? 'M' : 'L');
    pts.push([Number(x), Number(y)]);
  }
  return pts;
}

const cities = Object.entries(CITY_NETWORKS);

describe('cityNetworkGeometry', () => {
  it('covers the cities whose networks are not in doubt', () => {
    // A COUNT is not enough. A run that had silently lost two thirds of the
    // world still reported 34 cities and read like data. Overpass answers 200
    // with an empty element list BOTH when a query times out and when the
    // endpoint is a regional extract (`overpass.osm.ch` serves Switzerland
    // only), and "no relations found" is indistinguishable from a city that
    // genuinely has no metro — so the guard has to name cities whose networks
    // are not in question. Their absence means the generator was lied to, not
    // that the world changed. Slugs, not names: the DB holds several rows for
    // some of these.
    const CONTROLS = [
      'berlin',
      'madrid',
      'barcelona',
      'paris',
      'mexico-city',
      'amsterdam',
      'copenhagen',
      'vienna',
      'brussels',
      'lisboa',
    ];
    const missing = CONTROLS.filter((slug) => !(slug in CITY_NETWORKS));
    expect(missing, `control cities with no geometry: ${missing.join(', ')}`).toEqual([]);
    expect(cities.length).toBeGreaterThanOrEqual(100);
  });

  it.each(cities)('%s: path data is M/L with integer coordinates', (_slug, net) => {
    for (const line of net.lines) {
      const pts = parsePath(line.d);
      expect(pts.length).toBeGreaterThanOrEqual(2);
      for (const [x, y] of pts) {
        expect(Number.isInteger(x)).toBe(true);
        expect(Number.isInteger(y)).toBe(true);
      }
    }
  });

  it.each(cities)('%s: every segment is axis-aligned or exactly diagonal', (_slug, net) => {
    for (const line of net.lines) {
      const pts = parsePath(line.d);
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        expect(dx === 0 && dy === 0, `zero-length segment in ${line.ref}`).toBe(false);
        // Integer lattice: 45° is |dx| === |dy| exactly, no epsilon needed.
        expect(
          dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy),
          `segment ${dx},${dy} in ${line.ref} is not a multiple of 45°`,
        ).toBe(true);
      }
    }
  });

  it.each(cities)('%s: stays inside the viewBox', (_slug, net) => {
    const all = net.lines.flatMap((l) => parsePath(l.d));
    all.push([net.interchange.x, net.interchange.y]);
    for (const [x, y] of all) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(NETWORK_VIEWBOX.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(NETWORK_VIEWBOX.h);
    }
  });

  it.each(cities)('%s: at most four lines, each on its own track', (_slug, net) => {
    expect(net.lines.length).toBeGreaterThanOrEqual(1);
    expect(net.lines.length).toBeLessThanOrEqual(4);
    const tracks = net.lines.map((l) => l.track);
    expect(new Set(tracks).size).toBe(tracks.length);
    for (const t of tracks) expect(TRACKS).toContain(t);
    // Track is assigned by length rank, so the flagship line is always pink.
    expect(tracks[0]).toBe('pink');
  });

  it.each(cities)('%s: line refs are distinct', (_slug, net) => {
    // `<F>` is New York's F express, not a fifth line — one line taking two
    // track colors is the failure this catches.
    const refs = net.lines.map((l) => l.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it.each(cities)('%s: the station ring sits on a track', (_slug, net) => {
    // Set membership, not a distance tolerance — the interchange is chosen
    // from the lines' own vertices, so it either is one or the generator is
    // wrong (same invariant style as intentMapGeometry).
    const vertices = new Set(net.lines.flatMap((l) => parsePath(l.d)).map(([x, y]) => `${x},${y}`));
    expect(vertices.has(`${net.interchange.x},${net.interchange.y}`)).toBe(true);
  });

  it('is keyed by slugs', () => {
    for (const [slug] of cities) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('declares a known mode per city', () => {
    const modes: CityNetwork['mode'][] = ['subway', 'light_rail', 'tram'];
    for (const [, net] of cities) expect(modes).toContain(net.mode);
  });
});
