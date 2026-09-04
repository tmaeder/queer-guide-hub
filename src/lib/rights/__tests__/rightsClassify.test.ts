import { describe, it, expect } from 'vitest';
import { classifyCountryRight, valueForTopic } from '../rightsClassify';
import { topicBySlug } from '../rightsCatalog';

/**
 * `classifyCountryRight` is the single per-country reader both
 * `summariseRightsWorldwide` and the choropleth map call — see
 * `rightsWorldSummary.test.ts` for the worldwide-aggregate behaviour this
 * must stay consistent with.
 */

const crim = (legal: boolean | null) => ({
  lgbti_criminalization: legal === null ? {} : { legal },
});
const ssu = (marriage: string | null, civilUnion: string | null) => ({
  lgbti_same_sex_unions: JSON.stringify({
    summary: 'x',
    marriage,
    civil_union: civilUnion,
  }),
});

describe('classifyCountryRight — criminalisation', () => {
  const topic = topicBySlug('criminalisation')!;

  it('reads a criminalising country as severe', () => {
    expect(classifyCountryRight(crim(false), topic)).toBe('severe');
  });

  it('reads a decriminalised country as yes', () => {
    expect(classifyCountryRight(crim(true), topic)).toBe('yes');
  });

  it('leaves an absent .legal UNMEASURED, not a default', () => {
    expect(classifyCountryRight(crim(null), topic)).toBe('none');
    expect(classifyCountryRight({}, topic)).toBe('none');
  });
});

describe('classifyCountryRight — protection-matrix topics', () => {
  const topic = topicBySlug('employment')!;
  const row = (v: Record<string, string>) => ({ [topic.column]: v });

  it('classifies yes only when ALL FOUR declared attributes read Yes', () => {
    expect(classifyCountryRight(row({ so: 'Yes', gi: 'Yes', ge: 'Yes', sc: 'Yes' }), topic)).toBe(
      'yes',
    );
  });

  it('classifies partial when some but not all attributes read Yes', () => {
    // The load-bearing bar: protecting sexual orientation without gender
    // identity must NOT read as protecting trans people.
    expect(classifyCountryRight(row({ so: 'Yes', gi: 'No', ge: 'No', sc: 'No' }), topic)).toBe(
      'partial',
    );
  });

  it('classifies no when the country has a reading but none are Yes', () => {
    expect(classifyCountryRight(row({ so: 'No', gi: 'No', ge: 'No', sc: 'No' }), topic)).toBe('no');
  });

  it('classifies none when every attribute is "No data"', () => {
    expect(
      classifyCountryRight(
        row({ so: 'No data', gi: 'No data', ge: 'No data', sc: 'No data' }),
        topic,
      ),
    ).toBe('none');
  });
});

describe('classifyCountryRight — marriage vs civil-union share a column', () => {
  it('classifies differently for a civil-union-only country', () => {
    const row = ssu(null, 'Yes');
    const marriage = classifyCountryRight(row, topicBySlug('marriage')!);
    const civilUnion = classifyCountryRight(row, topicBySlug('civil-union')!);

    // Assert what the real vocab produces, not a forced expectation: a
    // civil-union-only country must not read as having marriage.
    expect(marriage).not.toBe('yes');
    expect(['yes', 'partial']).toContain(civilUnion);
  });

  it('reads the same column at the raw value level too', () => {
    const row = ssu('Yes', 'No');
    expect(valueForTopic(row, topicBySlug('marriage')!)).toBe('Yes');
    expect(valueForTopic(row, topicBySlug('civil-union')!)).toBe('No');
  });
});

describe('classifyCountryRight — gender-recognition (uncounted by the summary)', () => {
  const topic = topicBySlug('gender-recognition')!;

  it('still returns a real per-country kind', () => {
    // The worldwide summary refuses to aggregate this topic (UNCOUNTED_SLUGS)
    // because summing 250 countries needs the column's key layout
    // established; reading ONE country's own status kind does not.
    expect(classifyCountryRight({ [topic.column]: 'Possible' }, topic)).toBe('yes');
    expect(classifyCountryRight({ [topic.column]: 'Not possible' }, topic)).toBe('no');
    expect(classifyCountryRight({}, topic)).toBe('none');
  });

  /**
   * The shape production actually stores, and the one this topic was blind to
   * until 2026-09-01: `topicScalarValue` had no `gender-recognition` branch,
   * so it returned the jsonb OBJECT, `isReadableScalar` rejected it, and all
   * 250 countries classified as `none` — the /rights choropleth painted this
   * topic "no data" worldwide. The test above kept passing because it feeds a
   * bare string, which no country row has ever held.
   */
  it('reads the real jsonb blob, not only a bare scalar', () => {
    const blob = (gender_marker: string) => ({
      [topic.column]: { gender_marker, self_id: 'No', requires_surgery: 'Not required' },
    });
    expect(classifyCountryRight(blob('Possible'), topic)).toBe('yes');
    expect(classifyCountryRight(blob('Not Possible'), topic)).toBe('no');
    expect(classifyCountryRight(blob('Nominally Possible'), topic)).toBe('partial');
    // An empty blob is still absence, not a negative answer.
    expect(classifyCountryRight({ [topic.column]: {} }, topic)).toBe('none');
  });
});

describe('classifyCountryRight — never throws on malformed input', () => {
  it('degrades a garbage object value to none instead of a stringified guess', () => {
    const topic = topicBySlug('adoption')!;
    expect(classifyCountryRight({ [topic.column]: { nope: 1 } }, topic)).toBe('none');
  });

  it('degrades a garbage protection-matrix column shape to none', () => {
    const topic = topicBySlug('health')!;
    expect(classifyCountryRight({ [topic.column]: { nope: 1 } }, topic)).toBe('none');
    expect(classifyCountryRight({ [topic.column]: 'not an object' }, topic)).toBe('none');
  });

  it('never throws when the country row itself is absent', () => {
    const topic = topicBySlug('criminalisation')!;
    expect(() => classifyCountryRight(null as never, topic)).not.toThrow();
    expect(classifyCountryRight(null as never, topic)).toBe('none');
    expect(() => classifyCountryRight(undefined as never, topic)).not.toThrow();
  });
});

describe('classifyCountryRight — attribute lens', () => {
  const employment = topicBySlug('employment')!;
  const criminalisation = topicBySlug('criminalisation')!;

  const row = (so: string, gi: string, ge: string, sc: string) => ({
    lgbti_employment_protection: { so, gi, ge, sc },
  });

  it('reads a single attribute rather than requiring all four', () => {
    // Protects sexual orientation only — the exact erasure the strict bar exists
    // to refuse, and the exact case a trans lens must surface as unprotected.
    const soOnly = row('Yes', 'No', 'No', 'No');
    expect(classifyCountryRight(soOnly, employment, 'all')).toBe('partial');
    expect(classifyCountryRight(soOnly, employment, 'so')).toBe('yes');
    expect(classifyCountryRight(soOnly, employment, 'gi')).toBe('no');
  });

  it('a lensed attribute with no reading is none, not no', () => {
    expect(
      classifyCountryRight(row('Yes', 'No data', 'No data', 'No data'), employment, 'gi'),
    ).toBe('none');
  });

  it('defaults to the strict all-four bar', () => {
    const allYes = row('Yes', 'Yes', 'Yes', 'Yes');
    expect(classifyCountryRight(allYes, employment)).toBe('yes');
    expect(classifyCountryRight(allYes, employment, 'gi')).toBe('yes');
  });

  it('ignores the lens for non-matrix topics — one value covers everyone', () => {
    const crim = { lgbti_criminalization: { legal: false } };
    expect(classifyCountryRight(crim, criminalisation, 'gi')).toBe(
      classifyCountryRight(crim, criminalisation, 'all'),
    );
  });
});
