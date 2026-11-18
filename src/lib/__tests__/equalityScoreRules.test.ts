import { describe, it, expect } from 'vitest';
import {
  calculateEqualityScore,
  EQUALITY_SCORE_BASE,
  EQUALITY_SCORE_RULES,
} from '../../../supabase/functions/_shared/equality-score';

// The published points table must describe the formula the nightly import runs.
// Each case is the smallest ILGA row that triggers exactly one rule; the score
// delta from an empty row must equal that rule's published points.
const ssu = (summary: string) => JSON.stringify({ summary });
const PROTECTION = 'lgbti_employment_protection';

const ROW_FOR_RULE: Record<string, Record<string, unknown>> = {
  legal: { lgbti_criminalization: { legal: true } },
  criminalised: { lgbti_criminalization: { legal: false, penalty: '' } },
  marriage: { lgbti_same_sex_unions: ssu('Marriage') },
  'civil-union': { lgbti_same_sex_unions: ssu('Civil Union Only') },
  'protection-so': { [PROTECTION]: { so: 'Yes' } },
  'protection-gi': { [PROTECTION]: { gi: 'Yes' } },
  'hate-crime': { lgbti_hate_crime_law: { so: 'Yes' } },
  incitement: { lgbti_incitement_prohibition: { so: 'Yes' } },
  'expression-free': { lgbti_expression_restrictions: { summary: 'No Known Legal Barriers' } },
  'expression-restricted': { lgbti_expression_restrictions: { summary: 'Explicit' } },
  'association-free': { lgbti_association_restrictions: { status: 'No Known Legal Barriers' } },
  'association-restricted': { lgbti_association_restrictions: { status: 'Explicit' } },
  'adoption-joint': { lgbti_adoption_rights: 'Joint' },
  'adoption-second-parent': { lgbti_adoption_rights: 'Second Parent' },
  'conversion-ban': { lgbti_conversion_therapy_regulation: 'Banned' },
  'self-id': { lgbti_gender_recognition: { self_id: 'Yes' } },
  'marker-change': { lgbti_gender_recognition: { gender_marker: 'Possible' } },
  intersex: { lgbti_intersex_protection: 'Yes' },
};

// Penalty rules apply on top of "criminalised", so they are measured against it.
const PENALTY: Record<string, string> = {
  death: 'Death Penalty',
  life: '10 years to life in prison',
  eight: 'Up to 8 years imprisonment',
};

describe('EQUALITY_SCORE_RULES matches calculateEqualityScore', () => {
  it('starts every record at the published base', () => {
    expect(calculateEqualityScore({})).toBe(EQUALITY_SCORE_BASE);
  });

  it('covers every rule with a test case', () => {
    const tested = new Set([...Object.keys(ROW_FOR_RULE), ...Object.keys(PENALTY)]);
    expect(EQUALITY_SCORE_RULES.map((r) => r.id).sort()).toEqual([...tested].sort());
  });

  for (const rule of EQUALITY_SCORE_RULES) {
    it(`${rule.id}: ${rule.points > 0 ? '+' : ''}${rule.points}`, () => {
      if (rule.id in PENALTY) {
        const crim = (penalty: string) =>
          calculateEqualityScore({ lgbti_criminalization: { legal: false, penalty } });
        expect(crim(PENALTY[rule.id]) - crim('')).toBe(rule.points);
      } else {
        expect(calculateEqualityScore(ROW_FOR_RULE[rule.id]) - EQUALITY_SCORE_BASE).toBe(
          rule.points,
        );
      }
    });
  }
});
