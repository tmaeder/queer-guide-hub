import { describe, expect, it } from 'vitest';
import { classifyBoundariesBy, tallyFeatureClasses } from '../rightsWorldMapModel';
import {
  RECOGNITION_REGIMES,
  regimeOf,
  summariseRecognitionWorld,
} from '@/lib/rights/recognitionPerspective';
import { REGIME_LABEL_FALLBACK } from '../recognitionRegimeLabels';
import type { TransRightsCountry } from '@/hooks/useIntentData';

/**
 * The recognition choropleth's join and vocabulary.
 *
 * The invariant worth testing is not "MapLibre renders" (jsdom has no WebGL)
 * but that the MAP and the FIGURES BESIDE IT read one classifier. A map whose
 * legend disagrees with the band directly beneath it is worse than no map, and
 * that is a pure-data property this file can pin without a canvas.
 */

function country(
  code: string,
  lgr: Record<string, unknown> | null,
  population = 1_000,
): TransRightsCountry {
  return {
    id: code,
    name: code,
    slug: code.toLowerCase(),
    code,
    equality_score: null,
    lgbti_criminalization: null,
    lgbti_same_sex_unions: null,
    lgbti_gender_recognition: lgr,
    trans_violence_documented: null,
    population,
    human_development_index: null,
    gdp_per_capita_usd: null,
    continent_id: null,
  } as unknown as TransRightsCountry;
}

const feature = (id: number, iso: string): GeoJSON.Feature => ({
  type: 'Feature',
  id,
  properties: { ISO_A2: iso },
  geometry: { type: 'Polygon', coordinates: [[]] },
});

const boundaries: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  // DE self-ID, IN sterilisation, ZZ has no country row at all.
  features: [feature(1, 'DE'), feature(2, 'IN'), feature(3, 'ZZ')],
};

const COUNTRIES = [
  country('DE', { gender_marker: 'Possible', self_id: 'Yes', requires_surgery: 'Not required' }),
  country('IN', { gender_marker: 'Possible', self_id: 'No', requires_surgery: 'Required' }),
];

const classify = () =>
  classifyBoundariesBy(
    boundaries,
    COUNTRIES,
    'recognitionClass',
    (c) => regimeOf(c as unknown as Record<string, unknown>),
    'no-record',
  );

describe('recognition choropleth join', () => {
  it('stamps the regime the shared classifier returns', () => {
    const out = classify();
    const byIso = (iso: string) =>
      out.features.find((f) => f.properties?.ISO_A2 === iso)?.properties?.recognitionClass;
    expect(byIso('DE')).toBe('self-determination');
    expect(byIso('IN')).toBe('surgery');
  });

  /** A polygon with no row is unmeasured — never guessed into a measured class. */
  it('gives a boundary with no country row the empty class', () => {
    const out = classify();
    const zz = out.features.find((f) => f.properties?.ISO_A2 === 'ZZ');
    expect(zz?.properties?.recognitionClass).toBe('no-record');
  });

  it('joins case-insensitively', () => {
    const out = classifyBoundariesBy(
      boundaries,
      [country('de', { gender_marker: 'Possible', self_id: 'Yes' })],
      'recognitionClass',
      (c) => regimeOf(c as unknown as Record<string, unknown>),
      'no-record',
    );
    const de = out.features.find((f) => f.properties?.ISO_A2 === 'DE');
    expect(de?.properties?.recognitionClass).toBe('self-determination');
  });

  it('does not disturb the rights map’s own class property', () => {
    const out = classify();
    expect(out.features[0].properties?.rightsClass).toBeUndefined();
  });
});

describe('map and band cannot disagree', () => {
  /**
   * The load-bearing one. Both surfaces must land the same country in the same
   * bucket; if `regimeOf` ever grew a map-specific branch this fails.
   */
  it('assigns each country the same regime as the population summary', () => {
    const world = summariseRecognitionWorld(COUNTRIES);
    const painted = classify();
    for (const c of COUNTRIES) {
      const fromBand = world.buckets.find((b) => b.examples.some((e) => e.id === c.id))?.regime.id;
      const fromMap = painted.features.find((f) => f.properties?.ISO_A2 === c.code)?.properties
        ?.recognitionClass;
      expect(fromMap, `${c.code}`).toBe(fromBand);
    }
  });

  it('every regime has a label, so no legend station can render blank', () => {
    for (const regime of RECOGNITION_REGIMES) {
      expect(REGIME_LABEL_FALLBACK[regime.key], regime.key).toBeTruthy();
    }
  });
});

describe('the ink ramp means severity, as it does on /rights', () => {
  /**
   * `MAP_CLASS_INK` on /rights runs protected 0.12 → death 0.9: heavier ink is
   * worse. A reader who learns that there and meets a map here where the
   * heaviest ink was self-determination would read this one exactly backwards,
   * so the ramp must ascend along the ladder.
   */
  it('ascends monotonically from most recognition to least', () => {
    const ladder = RECOGNITION_REGIMES.filter((r) => r.texture === 'solid').map((r) => r.weight);
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i], `step ${i}`).toBeGreaterThan(ladder[i - 1]);
    }
  });

  it('keeps self-determination lightest and no-route heaviest', () => {
    const weight = (id: string) => RECOGNITION_REGIMES.find((r) => r.id === id)!.weight;
    expect(weight('self-determination')).toBeLessThan(weight('surgery'));
    expect(weight('surgery')).toBeLessThan(weight('impossible'));
  });

  /** The unknowns sit off the continuum — never heavier than a measured class. */
  it('never paints an unmeasured class as severe', () => {
    const heaviestUnknown = Math.max(
      ...RECOGNITION_REGIMES.filter((r) => r.texture === 'hatch').map((r) => r.weight),
    );
    expect(heaviestUnknown).toBeLessThan(
      RECOGNITION_REGIMES.find((r) => r.id === 'gatekept')!.weight,
    );
  });
});

describe('tallyFeatureClasses', () => {
  it('counts what the canvas paints, not what the country list holds', () => {
    // Three polygons, two rows: the tally must report the third as unmeasured
    // rather than silently omitting it, which is what makes the map's counts
    // legitimately differ from the legend's.
    expect(tallyFeatureClasses(classify().features, 'recognitionClass')).toEqual({
      'self-determination': 1,
      surgery: 1,
      'no-record': 1,
    });
  });
});
