import { describe, it, expect } from 'vitest';
import { readRightValue } from '../rightsValue';

/**
 * The full scalar vocabulary present in `countries` on 2026-08-08, with the
 * row count each value carried. Anything that stops matching here has either
 * been renamed upstream by ILGA or dropped from the vocabulary — both worth
 * failing over, because the fallback is silent.
 */
describe('readRightValue — live ILGA vocabulary', () => {
  const cases: Array<[string, string, ReturnType<typeof readRightValue>['kind'], number]> = [
    // value, field, expected kind, live row count
    ['No Known Legal Barriers', 'expression', 'yes', 174],
    ['Non-Explicit Legal Barriers', 'expression', 'no', 33],
    ['Explicit Legal Barriers', 'expression', 'severe', 27],
    ['Legal Barriers Likely to Exist', 'association', 'no', 29],
    ['Joint & Second Parent Adoption', 'adoption', 'yes', 62],
    ['Second Parent Adoption Only', 'adoption', 'partial', 2],
    ['No adoption possible', 'adoption', 'no', 173],
    ['Banned', 'conversionTherapy', 'yes', 27],
    ['Not banned', 'conversionTherapy', 'no', 199],
    ['Indirect', 'conversionTherapy', 'partial', 7],
    ['Marriage', 'unions', 'yes', 28],
    ['Marriage & Civil Union', 'unions', 'yes', 39],
    ['Civil Union Only', 'unions', 'partial', 14],
    ['Possible', 'genderMarker', 'yes', 69],
    ['Nominally Possible', 'genderMarker', 'partial', 14],
    ['Not Possible', 'genderMarker', 'no', 78],
    ['Not Possible (exceptions documented)', 'genderMarker', 'no', 4],
    ['Yes (for NB marker only)', 'selfId', 'partial', 1],
    ['Yes', 'intersex', 'yes', 9],
    ['No', 'intersex', 'no', 228],
    ['Varies', 'several', 'partial', 31],
    ['Unclear', 'several', 'partial', 3],
  ];

  for (const [value, field, kind, n] of cases) {
    it(`${field}: "${value}" is ${kind} (${n} rows)`, () => {
      expect(readRightValue(value).kind).toBe(kind);
    });
  }
});

/**
 * These four groups were misclassified until 2026-08-08 and are the reason the
 * module exists. Regressing any of them puts a positive glyph on a restriction.
 */
describe('readRightValue — the regressions this module was extracted to fix', () => {
  it('never scores a legal BARRIER as a protection', () => {
    // The old classifier tested `v.includes('legal')` in its positive branch.
    for (const v of [
      'Explicit Legal Barriers',
      'Non-Explicit Legal Barriers',
      'Legal Barriers Likely to Exist',
    ]) {
      expect(readRightValue(v).kind).not.toBe('yes');
    }
    // ...while the phrase that genuinely means "no barriers" still is one.
    expect(readRightValue('No Known Legal Barriers').kind).toBe('yes');
  });

  it('scores the best available adoption outcome as positive, not partial', () => {
    expect(readRightValue('Joint & Second Parent Adoption').kind).toBe('yes');
  });

  it('scores an impossible gender marker as negative, not partial', () => {
    expect(readRightValue('Not Possible').kind).toBe('no');
    expect(readRightValue('Not Possible (exceptions documented)').kind).toBe('no');
  });

  it('keeps the original negation trap closed', () => {
    // "not banned" contains "banned"; conversion therapy is still legal.
    expect(readRightValue('Not banned').kind).toBe('no');
    expect(readRightValue('Banned').kind).toBe('yes');
  });
});

describe('readRightValue — absence vs negative', () => {
  it('treats missing data as absence, never as a finding', () => {
    for (const v of [null, undefined, '', 'No data', 'unknown']) {
      const r = readRightValue(v);
      expect(r.kind).toBe('none');
      expect(r.valueKey).toBeNull();
      expect(r.raw).toBeNull();
    }
  });

  it('distinguishes a recorded No from no record at all', () => {
    expect(readRightValue('No').kind).toBe('no');
    expect(readRightValue('No data').kind).toBe('none');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(readRightValue('  EXPLICIT   legal barriers ').kind).toBe('severe');
  });
});

describe('readRightValue — unknown values', () => {
  it('never guesses an unmapped value into a polarity', () => {
    const r = readRightValue('Partially recognised in three provinces');
    expect(r.kind).toBe('partial');
    expect(r.valueKey).toBeNull();
  });

  it('still surfaces the source text so nothing silently disappears', () => {
    expect(readRightValue('Some new ILGA phrasing').raw).toBe('Some new ILGA phrasing');
  });
});

describe('readRightValue — severeNegative', () => {
  it('escalates a negative to severe where a negative is criminal exposure', () => {
    expect(readRightValue('No', true).kind).toBe('severe');
    expect(readRightValue(false, true).kind).toBe('severe');
  });

  it('never escalates a positive or an absence', () => {
    expect(readRightValue('Yes', true).kind).toBe('yes');
    expect(readRightValue('No data', true).kind).toBe('none');
  });
});
