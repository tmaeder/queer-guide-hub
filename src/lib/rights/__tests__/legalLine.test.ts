import { describe, it, expect } from 'vitest';
import { buildLegalLine, parseYear, type LegalStation } from '../legalLine';
import type { MilestoneRef } from '@/types/milestone';

function milestone(over: Partial<MilestoneRef> = {}): MilestoneRef {
  return {
    id: 'm1',
    slug: 'a-milestone',
    title: 'A milestone',
    date: '2017-06-30',
    date_precision: 'day',
    category: 'law-equality',
    impact: 'positive',
    significance: 5,
    ...over,
  };
}

const labelSlugs = (s: LegalStation) => (s.label.kind === 'topics' ? s.label.slugs : []);

describe('parseYear', () => {
  it.each([
    ['1969', 1969],
    ['1969-07-01', 1969],
    [2017, 2017],
    ['adopted 1994', 1994],
  ])('reads %p as %p', (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'yes', true, false, '12', '99999'])(
    'refuses %p rather than guessing',
    (input) => {
      expect(parseYear(input)).toBeNull();
    },
  );

  it('rejects a year outside the plausible range', () => {
    expect(parseYear('0999')).toBeNull();
    expect(parseYear('2101')).toBeNull();
  });
});

describe('buildLegalLine', () => {
  it('returns nothing when there is nothing', () => {
    expect(buildLegalLine({ country: null })).toEqual([]);
    expect(buildLegalLine({ country: {}, milestones: [] })).toEqual([]);
  });

  it('derives decriminalisation from the criminalisation column', () => {
    const line = buildLegalLine({
      country: { lgbti_criminalization: { decrim_year_1: '1969' } },
    });
    expect(line).toHaveLength(1);
    expect(line[0]).toMatchObject({
      year: 1969,
      source: 'ilga',
      section: 'criminalisation',
      impact: 'positive',
      label: { kind: 'decriminalised' },
    });
    expect(line[0].slug).toBeUndefined();
  });

  // A country that decriminalised and later RE-criminalised carries both facts:
  // import-ilga-data copies decrim_date_1/2 AND illegal_since verbatim with no `legal`
  // gate. Without this guard the page renders a positive "Same-sex activity
  // decriminalised" station for a country where it is currently a crime — and because
  // `illegal_since` is in no sincePaths, the re-criminalization year can never appear to
  // balance it.
  it('does not derive a decriminalisation station while the country still criminalises', () => {
    const line = buildLegalLine({
      country: { lgbti_criminalization: { decrim_year_1: '1969', legal: false } },
    });
    expect(line.filter((s) => s.section === 'criminalisation')).toEqual([]);
  });

  it('still derives decriminalisation when the country is not criminalising', () => {
    // legal:true AND legal absent must both keep the station — only an explicit `false`
    // suppresses it, so an unknown legal status does not silently erase real history.
    for (const crim of [{ decrim_year_1: '1969', legal: true }, { decrim_year_1: '1969' }]) {
      const line = buildLegalLine({ country: { lgbti_criminalization: crim } });
      expect(line).toHaveLength(1);
      expect(line[0]).toMatchObject({ year: 1969, label: { kind: 'decriminalised' } });
    }
  });

  it('decodes the unions column, which is a JSON string not an object', () => {
    const line = buildLegalLine({
      country: {
        lgbti_same_sex_unions: JSON.stringify({
          summary: 'Marriage',
          marriage_since: '2017',
          civil_union_since: '2001',
        }),
      },
    });
    expect(line.map((s) => s.year)).toEqual([2001, 2017]);
    expect(line.every((s) => s.section === 'family')).toBe(true);
    expect(labelSlugs(line[0])).toEqual(['civil-union']);
    expect(labelSlugs(line[1])).toEqual(['marriage']);
  });

  it('groups one reform year into a single station instead of seven', () => {
    // Seven anti-discrimination statutes all commencing in 2006 is one reform.
    const protections = Object.fromEntries(
      [
        'lgbti_constitutional_protection',
        'lgbti_employment_protection',
        'lgbti_housing_protection',
        'lgbti_education_protection',
        'lgbti_health_protection',
        'lgbti_goods_services_protection',
        'lgbti_bullying_protection',
      ].map((column) => [column, { so: 'Yes', so_since: '2006' }]),
    );

    const line = buildLegalLine({ country: protections });
    expect(line).toHaveLength(1);
    expect(line[0].section).toBe('antiDiscrimination');
    expect(labelSlugs(line[0])).toHaveLength(7);
  });

  it('keeps two different years in the same section apart', () => {
    const line = buildLegalLine({
      country: {
        lgbti_employment_protection: { so_since: '2006', gi_since: '2015' },
      },
    });
    expect(line.map((s) => s.year)).toEqual([2006, 2015]);
  });

  it('drops the derived station when a milestone tells the same event', () => {
    // The Germany case: `marriage_since: 2017` and a 2017 equality milestone.
    const line = buildLegalLine({
      country: { lgbti_same_sex_unions: JSON.stringify({ marriage_since: '2017' }) },
      milestones: [milestone({ date: '2017-06-30', category: 'law-equality' })],
    });
    expect(line).toHaveLength(1);
    expect(line[0].source).toBe('milestone');
    expect(line[0].label).toEqual({ kind: 'milestone', title: 'A milestone' });
  });

  it('keeps the derived station when the milestone is a different year', () => {
    const line = buildLegalLine({
      country: { lgbti_same_sex_unions: JSON.stringify({ marriage_since: '2017' }) },
      milestones: [milestone({ date: '2001-08-01', category: 'law-equality' })],
    });
    expect(line.map((s) => s.source)).toEqual(['milestone', 'ilga']);
  });

  it('never lets a protest suppress a statute in the same year', () => {
    const line = buildLegalLine({
      country: { lgbti_criminalization: { decrim_year_1: '1969' } },
      milestones: [milestone({ date: '1969-06-28', category: 'uprising-movement' })],
    });
    expect(line).toHaveLength(2);
    expect(line.map((s) => s.source).sort()).toEqual(['ilga', 'milestone']);
  });

  it('does not let a decriminalisation milestone suppress an unrelated section', () => {
    const line = buildLegalLine({
      country: {
        lgbti_criminalization: { decrim_year_1: '1994' },
        lgbti_employment_protection: { so_since: '1994' },
      },
      milestones: [milestone({ date: '1994-03-01', category: 'law-decriminalization' })],
    });
    // The milestone stands in for the derived decriminalisation station, so
    // that one is suppressed — but it says nothing about employment, which
    // must still appear in its own right.
    expect(line).toHaveLength(2);
    expect(line.filter((s) => s.source === 'ilga').map((s) => s.section)).toEqual([
      'antiDiscrimination',
    ]);
    expect(line.filter((s) => s.source === 'milestone')).toHaveLength(1);
  });

  it('is chronological ascending', () => {
    const line = buildLegalLine({
      country: {
        lgbti_criminalization: { decrim_year_1: '1969' },
        lgbti_same_sex_unions: JSON.stringify({ marriage_since: '2017' }),
        lgbti_employment_protection: { so_since: '2006' },
      },
    });
    expect(line.map((s) => s.year)).toEqual([1969, 2006, 2017]);
  });

  it('marks city milestones and does not duplicate one that both queries return', () => {
    const shared = milestone({ id: 'shared', date: '1980-01-01' });
    const line = buildLegalLine({
      country: {},
      milestones: [shared],
      cityMilestones: [shared, milestone({ id: 'city-only', date: '1990-01-01' })],
    });
    expect(line.map((s) => s.id)).toEqual(['shared', 'city-only']);
    expect(line[0].scope).toBe('country');
    expect(line[1].scope).toBe('city');
  });

  it('carries milestone impact through so the marker can encode it by shape', () => {
    const line = buildLegalLine({
      country: {},
      milestones: [milestone({ impact: 'negative', category: 'law-criminalization' })],
    });
    expect(line[0].impact).toBe('negative');
  });

  it('skips a milestone with an unparseable date rather than placing it wrongly', () => {
    const line = buildLegalLine({
      country: {},
      milestones: [milestone({ date: 'unknown' })],
    });
    expect(line).toEqual([]);
  });

  it('ignores a since-path holding a non-year', () => {
    const line = buildLegalLine({
      country: { lgbti_employment_protection: { so: 'Yes', so_since: 'Yes' } },
    });
    expect(line).toEqual([]);
  });
});
