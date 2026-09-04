import { describe, expect, it } from 'vitest';
import {
  TMM_BAND_ORDER,
  bandOf,
  latestPeriodOf,
  matchesBand,
  summariseTmmReporting,
} from '../tmmCoverage';
import { readTransViolence } from '../transSafety';
import type { TransRightsCountry } from '@/hooks/useIntentData';

function country(
  name: string,
  opts: { cases?: Record<string, number>; total?: number; criminalises?: boolean } = {},
): TransRightsCountry {
  const byPeriod = opts.cases ?? {};
  const total = opts.total ?? Object.values(byPeriod).reduce((sum, n) => sum + n, 0);
  return {
    id: name,
    name,
    slug: name.toLowerCase(),
    code: name.slice(0, 2).toUpperCase(),
    equality_score: null,
    lgbti_criminalization: opts.criminalises ? { legal: false } : { legal: true },
    lgbti_same_sex_unions: null,
    lgbti_gender_recognition: null,
    trans_violence_documented: total > 0 ? { total, by_period: byPeriod } : {},
    population: 1_000_000,
    human_development_index: null,
    gdp_per_capita_usd: null,
    continent_id: null,
  } as unknown as TransRightsCountry;
}

describe('summariseTmmReporting', () => {
  /**
   * The shape of the real corpus in miniature: the cases sit in the
   * non-criminalising country, and the criminalising one has recorded nothing.
   * Live figures are 95.8% and 45 of 67.
   */
  const rows = [
    country('Brazil', { total: 2031, criminalises: false }),
    country('Mexico', { total: 812, criminalises: false }),
    country('Iran', { criminalises: true }),
    country('Uganda', { criminalises: true }),
    country('Pakistan', { total: 139, criminalises: true }),
  ];

  it('reports the share of cases in non-criminalising countries', () => {
    const r = summariseTmmReporting(rows);
    expect(r.totalCases).toBe(2982);
    expect(r.casesInNonCriminalising).toBe(2843);
    expect(r.pctCasesInNonCriminalising).toBe(95);
  });

  it('counts criminalising countries that have recorded nothing', () => {
    const r = summariseTmmReporting(rows);
    expect(r.criminalisingTotal).toBe(3);
    expect(r.criminalisingWithNothingRecorded).toBe(2);
  });

  it('counts only countries with a documented case as documented', () => {
    expect(summariseTmmReporting(rows).documentedCountries).toBe(3);
  });

  /** No cases at all must not divide by zero into NaN on a blank page. */
  it('is safe on an empty corpus', () => {
    const r = summariseTmmReporting([]);
    expect(r.pctCasesInNonCriminalising).toBe(0);
    expect(r.totalCases).toBe(0);
  });

  /**
   * These two figures are unfiltered ON PURPOSE. The mean-equality comparison
   * they replaced only held inside a population floor — 66.2 vs 48.9 above a
   * million people, but 66.1 vs 64.3 across all 250 countries, which is no
   * finding at all. A statistic that needs an undisclosed filter does not
   * belong on a page about trusting data, so nothing here takes a threshold.
   */
  it('takes no population or size threshold', () => {
    const tiny = [
      country('Tuvalu', { criminalises: true }),
      country('Brazil', { total: 100, criminalises: false }),
    ];
    // A 10,000-person country counts exactly as one criminalising country with
    // nothing recorded — no floor silently drops it.
    expect(summariseTmmReporting(tiny).criminalisingWithNothingRecorded).toBe(1);
    expect(summariseTmmReporting(tiny).criminalisingTotal).toBe(1);
  });
});

describe('magnitude bands', () => {
  const rec = (total: number, cases: Record<string, number> = {}) =>
    readTransViolence({ total, by_period: cases });

  it.each([
    [1, '1-4'],
    [4, '1-4'],
    [5, '5-19'],
    [19, '5-19'],
    [20, '20-99'],
    [99, '20-99'],
    [100, '100+'],
    [2031, '100+'],
  ])('puts %i in %s', (n, band) => {
    expect(bandOf(rec(n))).toBe(band);
  });

  it('gives a country with nothing recorded no band', () => {
    expect(bandOf(readTransViolence({}))).toBeNull();
  });

  /**
   * The labels must stay MAGNITUDE words. "100 or more" describes how many
   * cases were documented; "worst" or "high risk" would assert the ranking
   * this whole section exists to refute.
   */
  it('uses no ordinal severity word in any band key', () => {
    for (const key of TMM_BAND_ORDER) {
      expect(key).not.toMatch(/worst|high|severe|danger|risk/i);
    }
  });
});

describe('latestPeriodOf', () => {
  it('is the newest period any country reports, not each row’s own last', () => {
    const records = [
      readTransViolence({ total: 3, by_period: { 'TDoR 2013': 3 } }),
      readTransViolence({ total: 5, by_period: { 'TDoR 2025': 5 } }),
    ];
    expect(latestPeriodOf(records)).toBe('TDoR 2025');
  });

  it('is null when nothing is recorded anywhere', () => {
    expect(latestPeriodOf([readTransViolence({})])).toBeNull();
  });

  /**
   * "In the latest period" must mean ONE fixed window. Keyed off each row's
   * own last entry it would mark a country whose last recorded case was in
   * 2013 as current.
   */
  it('does not match a country whose newest entry is an older period', () => {
    const stale = readTransViolence({ total: 3, by_period: { 'TDoR 2013': 3 } });
    expect(matchesBand(stale, 'latest', 'TDoR 2025')).toBe(false);
  });

  it('matches a country that reports in the latest period', () => {
    const current = readTransViolence({
      total: 8,
      by_period: { 'TDoR 2024': 3, 'TDoR 2025': 5 },
    });
    expect(matchesBand(current, 'latest', 'TDoR 2025')).toBe(true);
  });
});
