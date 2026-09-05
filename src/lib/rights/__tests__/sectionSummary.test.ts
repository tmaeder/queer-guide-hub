import { describe, it, expect } from 'vitest';
import { summariseSection } from '../sectionSummary';

describe('summariseSection', () => {
  it('reports honest absence, not a measured zero', () => {
    // "0 of 7" would claim we looked and found nothing protected. We did not
    // look — the columns are empty — and the collapsed row has to say which.
    expect(summariseSection({}, 'antiDiscrimination')).toEqual({
      covered: 0,
      total: 7,
      recorded: 0,
    });
    expect(summariseSection(null, 'family').recorded).toBe(0);
  });

  it('counts a matrix topic as covered when any attribute is protected', () => {
    // Demanding all four would report "0 of 7" for a country protecting
    // sexual orientation everywhere — contradicted by its own rows below.
    const summary = summariseSection(
      { lgbti_employment_protection: { so: 'Yes', gi: 'No', ge: 'No data', sc: 'No data' } },
      'antiDiscrimination',
    );
    expect(summary).toEqual({ covered: 1, total: 7, recorded: 1 });
  });

  it('records a matrix topic that is measured but negative', () => {
    const summary = summariseSection(
      { lgbti_employment_protection: { so: 'No', gi: 'No', ge: 'No', sc: 'No' } },
      'antiDiscrimination',
    );
    expect(summary.covered).toBe(0);
    expect(summary.recorded).toBe(1);
  });

  it('folds civil union into marriage rather than double-weighting unions', () => {
    // The card renders both off one column as one row; counting them twice
    // would make family a 3-topic section that can score 2 for one statute.
    const summary = summariseSection(
      { lgbti_same_sex_unions: JSON.stringify({ summary: 'Marriage' }) },
      'family',
    );
    expect(summary.total).toBe(2);
    expect(summary.covered).toBe(1);
  });

  it('does not count a partial union as covered', () => {
    const summary = summariseSection(
      { lgbti_same_sex_unions: JSON.stringify({ summary: 'Civil union only' }) },
      'family',
    );
    expect(summary.covered).toBe(0);
    expect(summary.recorded).toBe(1);
  });

  it('reads gender recognition off its marker, not the whole object', () => {
    const covered = summariseSection(
      { lgbti_gender_recognition: { gender_marker: 'Possible' } },
      'identity',
    );
    expect(covered.covered).toBe(1);

    const not = summariseSection(
      { lgbti_gender_recognition: { gender_marker: 'Not possible' } },
      'identity',
    );
    expect(not.covered).toBe(0);
    expect(not.recorded).toBe(1);
  });

  it('counts the criminalisation section off its own vocabulary', () => {
    const summary = summariseSection(
      {
        lgbti_expression_restrictions: { summary: 'No known legal barriers' },
        lgbti_association_restrictions: { status: 'Explicit legal barriers' },
      },
      'criminalisation',
    );
    // expression protected, association recorded-but-severe, criminalisation empty
    expect(summary).toEqual({ covered: 1, total: 3, recorded: 2 });
  });
});
