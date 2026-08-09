import { describe, it, expect } from 'vitest';
import { worstCountryOf } from '../useTripSafety';
import type { CountrySafety } from '../useTripSafety';

/**
 * The fabricated defaults, pinned.
 *
 * `equality_score` forced every caller to invent a number for "we don't know",
 * and each invention was a claim:
 *
 *   ?? 50   an all-unscored trip computed 50, never cleared `< 40`, and
 *           reported overall risk `low` — unmeasured read as safe
 *   ?? 100  sorting ascending put unmeasured LAST, so it could never be the
 *           worst — and the warning copy NAMES the worst country
 *
 * The verdict has a real `unknown` that sits outside the order, so none of
 * these need a number at all.
 */
const mk = (over: Partial<CountrySafety>): CountrySafety =>
  ({
    id: over.name ?? 'x',
    name: 'X',
    code: null,
    equality_score: null,
    scoreBreakdown: { score: 0, label: 'No Data', color: '', bgColor: '' },
    criminalized: false,
    deathPenalty: false,
    deathPenaltyRisk: 'none',
    verdict: 'unknown',
    lgbti_criminalization: null,
    lgbti_employment_protection: null,
    lgbti_same_sex_unions: null,
    lgbti_adoption_rights: null,
    lgbti_conversion_therapy_regulation: null,
    ...over,
  }) as CountrySafety;

describe('worstCountryOf ranks by verdict, not by a fabricated score', () => {
  it('picks the criminalising country even when it has no score', () => {
    // The exact defect: sorting on `?? 100` put the unscored criminalising
    // country last, so a DIFFERENT country got named in the sentence
    // "Same-sex activity can carry the death penalty in {name}".
    const worst = worstCountryOf([
      mk({ name: 'Scored But Fine', equality_score: 90, verdict: 'protected' }),
      mk({ name: 'Unscored Criminalising', equality_score: null, verdict: 'criminalized-severe' }),
    ]);
    expect(worst?.name).toBe('Unscored Criminalising');
  });

  it('prefers a measured country over an unmeasured one', () => {
    const worst = worstCountryOf([
      mk({ name: 'Unknown', verdict: 'unknown' }),
      mk({ name: 'Hostile', verdict: 'hostile', equality_score: 30 }),
    ]);
    expect(worst?.name).toBe('Hostile');
  });

  it('falls back to an unmeasured country only when nothing is measured', () => {
    const worst = worstCountryOf([mk({ name: 'Only Unknown', verdict: 'unknown' })]);
    expect(worst?.name).toBe('Only Unknown');
  });

  it('breaks ties on score without letting a null win', () => {
    const worst = worstCountryOf([
      mk({ name: 'Hostile null', verdict: 'hostile', equality_score: null }),
      mk({ name: 'Hostile 20', verdict: 'hostile', equality_score: 20 }),
    ]);
    expect(worst?.name).toBe('Hostile 20');
  });

  it('is undefined for an empty set rather than throwing', () => {
    expect(worstCountryOf([])).toBeUndefined();
  });
});
