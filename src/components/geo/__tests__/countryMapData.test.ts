import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_MAP_CODES,
  countryMapUrl,
  hasCountryMap,
  type CountryMapData,
} from '../countryMapIndex';

/**
 * Guards the GENERATED silhouettes in `public/maps/country/`.
 *
 * Reads the real files off disk rather than importing them: they are static
 * assets on purpose (1.1 MB, deliberately out of the JS bundle), so importing
 * them here would both defeat that and test a different thing than what ships.
 */
const MAP_DIR = resolve(__dirname, '../../../../public/maps/country');

const load = (code: string): CountryMapData =>
  JSON.parse(readFileSync(resolve(MAP_DIR, `${code.toLowerCase()}.json`), 'utf8'));

describe('country map data', () => {
  it('ships a map for every indexed code, and nothing extra', () => {
    const onDisk = readdirSync(MAP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, '').toUpperCase())
      .sort();
    expect(onDisk).toEqual([...COUNTRY_MAP_CODES].sort());
  });

  // A bare count is not enough — the index could shrink to a handful and still
  // be internally consistent. The floor catches a truncated regeneration.
  it('covers essentially every country', () => {
    expect(COUNTRY_MAP_CODES.length).toBeGreaterThanOrEqual(200);
  });

  /**
   * Named controls, not a sample: each of these exercises a specific failure
   * the generator had to be fixed for, so a regeneration that quietly breaks
   * one cannot hide behind the aggregate pass above.
   */
  const CONTROLS: Record<string, string> = {
    CH: 'border lakes survive the land clip',
    JP: 'archipelago chains across the Okinawa hop',
    BR: 'one path per polygon — a single evenodd path punched holes',
    RU: 'antimeridian unwrap',
    US: 'antimeridian shift applied to CITIES too, not just land',
    FR: 'frames on the mainland, not on French Guiana',
    NO: 'Bjørnøya must not bridge the cluster out to Svalbard',
    ID: 'archipelago survives the mainland cluster cut',
    GR: 'island country',
    NZ: 'two main islands',
  };

  it.each(Object.entries(CONTROLS))('%s is present (%s)', (code) => {
    expect(hasCountryMap(code)).toBe(true);
    expect(existsSync(resolve(MAP_DIR, `${code.toLowerCase()}.json`))).toBe(true);
  });

  it.each(COUNTRY_MAP_CODES.map((c) => [c]))('%s is structurally sound', (code) => {
    const d = load(code);

    expect(d.iso).toBe(code);
    expect(d.name.length).toBeGreaterThan(0);
    expect(d.w).toBeGreaterThan(0);
    expect(d.h).toBeGreaterThan(0);

    // Land is an ARRAY because concatenating polygons into one evenodd path
    // makes overlapping landmasses cancel out.
    expect(Array.isArray(d.land)).toBe(true);
    expect(d.land.length).toBeGreaterThan(0);
    // `M` and `Z` both appear mid-string: one land entry holds a polygon's
    // outer ring followed by its holes, and the lake path concatenates every
    // lake in the frame. Only M/L/Z ever appear — no curves, no relative
    // commands — so anything else is a malformed emit.
    for (const path of [...d.land, ...(d.lakes ? [d.lakes] : [])]) {
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(true);
      expect(path).not.toMatch(/[^\dMLZ .-]/);
    }

    for (const dot of d.dots) {
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThanOrEqual(d.w);
      expect(dot.y).toBeGreaterThanOrEqual(0);
      expect(dot.y).toBeLessThanOrEqual(d.h);
    }

    // At most one capital, and the label describes it — a label with no dot
    // under it renders a pin pointing at empty sea.
    const capitals = d.dots.filter((dot) => dot.c === 1);
    expect(capitals.length).toBeLessThanOrEqual(1);
    if (d.label) {
      expect(capitals.length).toBe(1);
      expect(d.label.x).toBe(capitals[0].x);
      expect(d.label.y).toBe(capitals[0].y);
      expect(d.label.t.length).toBeGreaterThan(0);
    }
  });

  /**
   * The mainland must still dominate its own frame.
   *
   * Measuring the WHOLE geometry proves nothing — the projector fits whatever
   * it is given, so one axis always fills and a country framed on its overseas
   * territory scores identically to one framed correctly. What separates them
   * is how much of the frame the LARGEST landmass alone occupies.
   *
   * Scoped to countries that have exactly one mainland. An archipelago is
   * legitimately low (Indonesia 0.24, Japan 0.35) and so is the US at 0.49,
   * where Alaska is correctly kept — including any of them would force the
   * threshold below the value this test exists to catch.
   */
  it.each(['FR', 'NO', 'PT', 'ES', 'EC', 'CL', 'NL'])(
    '%s frames its mainland, not a distant territory',
    (code) => {
      const d = load(code);
      const biggest = d.land.reduce((a, b) => (b.length > a.length ? b : a));
      const pts = biggest
        .slice(1)
        .split(/[LZ]/)
        .filter((s) => s.trim())
        .map((pair) => pair.trim().split(' ').map(Number))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const fill = Math.max(
        (Math.max(...xs) - Math.min(...xs)) / d.w,
        (Math.max(...ys) - Math.min(...ys)) / d.h,
      );
      // These sit at 0.757-0.840. Norway scored 0.49 while Bjørnøya was
      // bridging the cluster out to Svalbard.
      expect(fill).toBeGreaterThan(0.7);
    },
  );
});

describe('countryMapIndex', () => {
  it('matches case-insensitively and rejects unknowns', () => {
    expect(hasCountryMap('ch')).toBe(true);
    expect(hasCountryMap('CH')).toBe(true);
    expect(hasCountryMap('ZZ')).toBe(false);
    expect(hasCountryMap(null)).toBe(false);
    expect(hasCountryMap(undefined)).toBe(false);
    expect(hasCountryMap('')).toBe(false);
  });

  it('builds a lowercase url', () => {
    expect(countryMapUrl('CH')).toBe('/maps/country/ch.json');
  });

  // The overseas départements and uninhabited islands Natural Earth folds into
  // a parent feature. They are ABSENT on purpose — the component renders
  // nothing rather than fetching a 404.
  it('has no geometry for territories folded into a parent', () => {
    for (const code of ['GF', 'GP', 'MQ', 'RE', 'YT', 'SJ', 'BV']) {
      expect(hasCountryMap(code)).toBe(false);
    }
  });
});
