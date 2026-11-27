import { describe, expect, it } from 'vitest';
import {
  dedupeClassifications,
  lifespanYears,
  primaryProfession,
  sameClassification,
} from '../personClassification';

describe('dedupeClassifications', () => {
  it('collapses the Sylvia Rivera profession/role/field triple', () => {
    // prod: profession "Activist", roles ["activist"], fields ["activism"]
    expect(dedupeClassifications('Activist', ['activist'])).toEqual([]);
    expect(dedupeClassifications('Activist', ['activism'])).toEqual([]);
  });

  it('collapses a field that prefixes the profession', () => {
    expect(dedupeClassifications('Drag queen', ['Drag'])).toEqual([]);
  });

  it('keeps genuinely different classifications', () => {
    expect(dedupeClassifications('Actor', ['Singer', 'activism', 'singer'])).toEqual([
      'Singer',
      'activism',
    ]);
    expect(sameClassification('Painter', 'Poet')).toBe(false);
    expect(sameClassification('Writer', 'Writing')).toBe(false);
  });
});

describe('primaryProfession', () => {
  it('takes the first comma token', () => {
    expect(primaryProfession('Actor, Singer')).toBe('Actor');
    expect(primaryProfession('  ')).toBeNull();
    expect(primaryProfession(null)).toBeNull();
  });
});

describe('lifespanYears', () => {
  it('reads years from ISO dates', () => {
    expect(lifespanYears('1951-07-02', '2002-02-19')).toEqual({ birth: '1951', death: '2002' });
    expect(lifespanYears('1984-09-11', null)).toEqual({ birth: '1984', death: null });
    expect(lifespanYears(null, null)).toEqual({ birth: null, death: null });
  });
});
