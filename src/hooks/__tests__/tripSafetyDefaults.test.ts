import { describe, it, expect } from 'vitest';
import { worstCountryOf, travelVerdictOf } from '../useTripSafety';
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
    // These cases pin ranking-by-verdict-rank against the old fabricated
    // score, which reads identically on either field. Mirroring `verdict`
    // keeps them testing exactly what they were written to test after
    // `worstCountryOf` moved onto `travelVerdict`.
    travelVerdict: over.travelVerdict ?? over.verdict ?? 'unknown',
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

/**
 * The traffic light is not `general`.
 *
 * `general` is `worstOf(lgb, trans, intersex)` and the engine's own comment
 * says it is "for SORTING AND FILTERING ONLY. Never render it as a single
 * adjective." It reached users anyway, laundered through `overallRisk`:
 * hostile → 'moderate' → SafetyVerdict renders the word "Mixed".
 *
 * Measured on prod 2026-08-30, over all 250 rows:
 *
 *   intersex lens `hostile`        219 / 250
 *   general verdict `hostile`      156 / 250   (only 3 reach `protected`)
 *   published `hostile` while
 *     their LGB lens is protected   48         Norway, Sweden, Germany,
 *                                              France, UK, Canada, Ireland,
 *                                              New Zealand, Uruguay, Brazil…
 *   false cross-border warnings    468 ordered pairs whose DESTINATION does
 *                                  not criminalise (Denmark → Norway,
 *                                  Spain → France, Denmark → Sweden)
 *
 * The intersex readings are TRUE — Norway really has not banned non-consensual
 * intersex surgery, and really does not list sex characteristics as a protected
 * ground. The defect is that a lens which is `hostile` for 88% of the world
 * carries no discriminating power, so routing it into a four-rung traffic light
 * paints 62% of the planet amber. Noise in a safety UI is worse than silence:
 * an amber that fires on Norway teaches travellers to ignore the amber that
 * fires on Uganda.
 *
 * So the tier is driven by the lenses that actually vary, and the intersex gap
 * is stated where it can be read honestly — `LensVerdictSummary` still renders
 * "Intersex — Few or no protections" on the country page. This narrows what the
 * traffic light claims; it removes nothing a user could previously see.
 */
describe('travelVerdictOf excludes the near-constant intersex lens', () => {
  /** lgb + trans protected, intersex hostile — Norway, Sweden, Canada. */
  const norwayShape = {
    lgbti_criminalization: { legal: true, death_penalty: 'No' },
    lgbti_same_sex_unions: JSON.stringify({ summary: 'Marriage' }),
    lgbti_adoption_rights: 'Joint & Second Parent Adoption',
    lgbti_employment_protection: { so: 'Yes', gi: 'Yes', ge: 'Yes', sc: 'No' },
    lgbti_hate_crime_law: { so: 'Yes', gi: 'Yes', ge: 'Yes', sc: 'No' },
    lgbti_housing_protection: { so: 'Yes', gi: 'Yes', ge: 'Yes', sc: 'No' },
    lgbti_health_protection: { so: 'Yes', gi: 'Yes', ge: 'Yes', sc: 'No' },
    lgbti_gender_recognition: { gender_marker: 'Possible', self_id: 'Yes', requires_surgery: 'No' },
    lgbti_conversion_therapy_regulation: 'Banned',
    lgbti_intersex_protection: 'No',
  };

  it('does not call a country hostile on the intersex lens alone', () => {
    expect(travelVerdictOf(norwayShape)).toBe('protected');
  });

  it('still reports hostility when the LGB or trans lens is hostile', () => {
    // Russia's shape: the negatives are recorded "No", not a data gap.
    const russiaShape = {
      lgbti_criminalization: { legal: true, death_penalty: 'No' },
      lgbti_same_sex_unions: JSON.stringify({ summary: 'No' }),
      lgbti_adoption_rights: 'No adoption possible',
      lgbti_employment_protection: { so: 'No', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_hate_crime_law: { so: 'No', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_housing_protection: { so: 'No', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_health_protection: { so: 'No', gi: 'No', ge: 'No', sc: 'No' },
      lgbti_gender_recognition: { gender_marker: 'Not Possible', self_id: 'No' },
      lgbti_conversion_therapy_regulation: 'Not banned',
      lgbti_intersex_protection: 'No',
    };
    expect(travelVerdictOf(russiaShape)).toBe('hostile');
  });

  it('never lets criminalisation escape — INV-1 still dominates', () => {
    expect(
      travelVerdictOf({
        ...norwayShape,
        lgbti_criminalization: { legal: false, death_penalty: 'No', penalty: '10 years' },
      }),
    ).toBe('criminalized');
  });

  it('escalates a capital penalty', () => {
    expect(
      travelVerdictOf({
        ...norwayShape,
        lgbti_criminalization: { legal: false, death_penalty: 'Yes' },
      }),
    ).toBe('criminalized-severe');
  });

  it('reports unknown when nothing is measured, rather than guessing safe', () => {
    expect(travelVerdictOf({})).toBe('unknown');
  });
});
