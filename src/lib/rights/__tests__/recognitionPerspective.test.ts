import { describe, expect, it } from 'vitest';
import {
  RECOGNITION_REGIMES,
  developmentCounterexamples,
  regimeOf,
  selfIdTimeline,
  summariseRecognitionWorld,
  type RegimeId,
} from '../recognitionPerspective';
import type { TransRightsCountry } from '@/hooks/useIntentData';

function country(
  name: string,
  lgr: Record<string, unknown> | null,
  extra: Partial<TransRightsCountry> = {},
): TransRightsCountry {
  return {
    id: name.toLowerCase(),
    name,
    slug: name.toLowerCase(),
    code: name.slice(0, 2).toUpperCase(),
    equality_score: null,
    lgbti_criminalization: null,
    lgbti_same_sex_unions: null,
    lgbti_gender_recognition: lgr,
    trans_violence_documented: null,
    population: 1_000,
    human_development_index: null,
    gdp_per_capita_usd: null,
    continent_id: null,
    ...extra,
  } as unknown as TransRightsCountry;
}

describe('regimeOf', () => {
  const cases: [string, Record<string, unknown>, RegimeId][] = [
    ['no marker record', {}, 'no-record'],
    ['explicit no data', { gender_marker: 'No data' }, 'no-record'],
    ['not possible', { gender_marker: 'Not Possible' }, 'impossible'],
    [
      'not possible with exceptions',
      { gender_marker: 'Not Possible (exceptions documented)' },
      'impossible',
    ],
    ['unclear marker', { gender_marker: 'Unclear' }, 'unclear'],
    ['varies marker', { gender_marker: 'Varies' }, 'unclear'],
    [
      'possible but sterilisation required',
      { gender_marker: 'Possible', requires_surgery: 'Required' },
      'surgery',
    ],
    [
      'possible with self-ID',
      { gender_marker: 'Possible', self_id: 'Yes', requires_surgery: 'Not required' },
      'self-determination',
    ],
    [
      'possible, gatekept',
      { gender_marker: 'Possible', self_id: 'No', requires_surgery: 'Not required' },
      'gatekept',
    ],
    ['nominally possible', { gender_marker: 'Nominally Possible' }, 'nominal'],
  ];

  it.each(cases)('%s', (_label, lgr, expected) => {
    expect(regimeOf({ lgbti_gender_recognition: lgr })).toBe(expected);
  });

  /**
   * Vietnam's actual shape. Filing it under "on paper only" would hide the
   * sterilisation requirement behind the softer of the two facts, which is
   * why `surgery` is tested before `nominal`.
   */
  it('puts a nominally-possible country that demands surgery under surgery', () => {
    expect(
      regimeOf({
        lgbti_gender_recognition: {
          gender_marker: 'Nominally Possible',
          requires_surgery: 'Required',
        },
      }),
    ).toBe('surgery');
  });

  /** Nepal. A real provision, but not general self-determination. */
  it('does not count a non-binary-only marker as self-determination', () => {
    expect(
      regimeOf({
        lgbti_gender_recognition: {
          gender_marker: 'Possible',
          self_id: 'Yes (for NB marker only)',
          requires_surgery: 'Not required',
        },
      }),
    ).toBe('gatekept');
  });

  /** The vocabulary bug, restated at the classifier: 'Yes' is not a requirement. */
  it('does not treat requires_surgery "Yes" as a surgery regime', () => {
    expect(
      regimeOf({
        lgbti_gender_recognition: { gender_marker: 'Possible', requires_surgery: 'Yes' },
      }),
    ).not.toBe('surgery');
  });
});

describe('summariseRecognitionWorld', () => {
  const world = [
    country('Selfid', { gender_marker: 'Possible', self_id: 'Yes' }, { population: 100 }),
    country(
      'Surgery',
      { gender_marker: 'Possible', requires_surgery: 'Required' },
      {
        population: 900,
      },
    ),
    country('Blank', {}, { population: 7 }),
  ];

  /**
   * The invariant every 100% band depends on. A bucket set that stops
   * partitioning renders a chart whose segments do not add up to the whole,
   * and nothing else in the UI would notice.
   */
  it('partitions the world — buckets sum to the totals', () => {
    const s = summariseRecognitionWorld(world);
    expect(s.buckets.reduce((n, b) => n + b.countries, 0)).toBe(s.totalCountries);
    expect(s.buckets.reduce((n, b) => n + b.people, 0)).toBe(s.totalPeople);
    expect(s.totalCountries).toBe(3);
    expect(s.totalPeople).toBe(1_007);
  });

  it('assigns every country to exactly one bucket', () => {
    const s = summariseRecognitionWorld(world);
    const ids = s.buckets.flatMap((b) => b.examples.map((e) => e.id));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids).toHaveLength(3);
  });

  it('always returns all seven buckets, including empty ones', () => {
    const s = summariseRecognitionWorld([]);
    expect(s.buckets.map((b) => b.regime.id)).toEqual(RECOGNITION_REGIMES.map((r) => r.id));
    expect(s.buckets.every((b) => b.countries === 0)).toBe(true);
  });

  it('counts a country with no population as a country but not as people', () => {
    const s = summariseRecognitionWorld([
      country('Nowhere', { gender_marker: 'Possible', self_id: 'Yes' }, { population: null }),
    ]);
    expect(s.totalCountries).toBe(1);
    expect(s.totalPeople).toBe(0);
  });

  it('orders examples by population so the readout leads with the largest', () => {
    const s = summariseRecognitionWorld([
      country(
        'Small',
        { gender_marker: 'Possible', requires_surgery: 'Required' },
        {
          population: 10,
        },
      ),
      country(
        'Big',
        { gender_marker: 'Possible', requires_surgery: 'Required' },
        {
          population: 999,
        },
      ),
    ]);
    const surgery = s.buckets.find((b) => b.regime.id === 'surgery')!;
    expect(surgery.examples.map((e) => e.name)).toEqual(['Big', 'Small']);
  });

  /** The whole point of the page, in one assertion. */
  it('lets country share and people share disagree', () => {
    const s = summariseRecognitionWorld(world);
    const surgery = s.buckets.find((b) => b.regime.id === 'surgery')!;
    expect(surgery.countries / s.totalCountries).toBeLessThan(0.35);
    expect(surgery.people / s.totalPeople).toBeGreaterThan(0.85);
  });
});

describe('developmentCounterexamples', () => {
  it('finds rich countries that still demand sterilisation', () => {
    const { highHdiRequiresSurgery, lowHdiHasSelfId } = developmentCounterexamples([
      country(
        'Rich',
        { gender_marker: 'Possible', requires_surgery: 'Required' },
        {
          human_development_index: 0.925,
        },
      ),
      country(
        'RichFree',
        { gender_marker: 'Possible', self_id: 'Yes' },
        {
          human_development_index: 0.95,
        },
      ),
      country(
        'PoorFree',
        { gender_marker: 'Possible', self_id: 'Yes' },
        {
          human_development_index: 0.7,
        },
      ),
    ]);
    expect(highHdiRequiresSurgery.map((r) => r.name)).toEqual(['Rich']);
    expect(lowHdiHasSelfId.map((r) => r.name)).toEqual(['PoorFree']);
  });

  it('excludes a country with no HDI rather than treating it as zero', () => {
    const { lowHdiHasSelfId } = developmentCounterexamples([
      country(
        'Unknown',
        { gender_marker: 'Possible', self_id: 'Yes' },
        {
          human_development_index: null,
        },
      ),
    ]);
    expect(lowHdiHasSelfId).toEqual([]);
  });
});

describe('selfIdTimeline', () => {
  it('accumulates by year and lists that year’s countries', () => {
    const t = selfIdTimeline([
      country('Argentina', { gender_marker: 'Possible', self_id: 'Yes', self_id_since: 2012 }),
      country('Malta', { gender_marker: 'Possible', self_id: 'Yes', self_id_since: 2015 }),
      country('Ireland', { gender_marker: 'Possible', self_id: 'Yes', self_id_since: 2015 }),
    ]);
    expect(t).toEqual([
      { year: 2012, countries: ['Argentina'], cumulative: 1 },
      { year: 2015, countries: ['Ireland', 'Malta'], cumulative: 3 },
    ]);
  });

  it('skips a self-ID country with no recorded year rather than inventing one', () => {
    const t = selfIdTimeline([
      country('Undated', { gender_marker: 'Possible', self_id: 'Yes', self_id_since: null }),
    ]);
    expect(t).toEqual([]);
  });

  /**
   * Greece's live shape: `self_id_since: 2017` with `self_id: 'No'`. A country
   * that no longer qualifies must not appear on a chart of countries that do,
   * so the affirmation is tested BEFORE the year. Reversing those two checks
   * silently adds a country that lost the right.
   */
  it('ignores a country that has a start year but no longer has the right', () => {
    expect(
      selfIdTimeline([
        country('Greece', { gender_marker: 'Possible', self_id: 'No', self_id_since: 2017 }),
      ]),
    ).toEqual([]);
  });
});
