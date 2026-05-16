import { describe, it, expect } from 'vitest';
import { parentOrder, ADULT_CATEGORY_NAMES, isAdultCategoryName, getCategoryIcon, getCategoryShortName } from '../categoryMeta';

describe('categoryMeta', () => {
  it('parentOrder is array', () => {
    expect(Array.isArray(parentOrder)).toBe(true);
  });
  it('ADULT_CATEGORY_NAMES is non-empty', () => {
    expect(ADULT_CATEGORY_NAMES.size).toBeGreaterThan(0);
  });
  it('isAdultCategoryName false for empty', () => {
    expect(isAdultCategoryName(null)).toBe(false);
    expect(isAdultCategoryName('')).toBe(false);
  });
  it('getCategoryIcon returns a component', () => {
    expect(getCategoryIcon('anything')).toBeDefined();
  });
  it('getCategoryShortName returns string', () => {
    expect(typeof getCategoryShortName('unknown')).toBe('string');
  });
});
