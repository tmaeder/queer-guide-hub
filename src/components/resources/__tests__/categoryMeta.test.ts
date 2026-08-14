import { describe, it, expect } from 'vitest';
import {
  parentOrder,
  ADULT_CATEGORY_NAMES,
  isAdultCategoryName,
  isAdultTag,
  getCategoryShortName,
} from '../categoryMeta';

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
  describe('isAdultTag', () => {
    it('trusts the is_adult flag even when the category is unrecognised', () => {
      // The regression: get_tag_ontology returns unified_tags.category, whose
      // legacy free-text values are in no v2 taxonomy set. Before the flag was
      // consulted these all rendered with Safe mode on.
      expect(isAdultTag({ is_adult: true, category: 'Kink & Fetish' })).toBe(true);
      expect(isAdultTag({ is_adult: true, category: 'Power Exchange' })).toBe(true);
      expect(isAdultTag({ is_adult: true, category: 'BDSM' })).toBe(true);
      expect(isAdultTag({ is_adult: true, category: null })).toBe(true);
    });

    it('still honours the v2 category names when the flag is unset', () => {
      expect(isAdultTag({ category: 'Practices & Play' })).toBe(true);
      expect(isAdultTag({ is_adult: false, category: 'Fetishes & Interests' })).toBe(true);
    });

    it('leaves non-adult tags visible', () => {
      expect(isAdultTag({ is_adult: false, category: 'Community & Culture' })).toBe(false);
      expect(isAdultTag({ category: null })).toBe(false);
      expect(isAdultTag({})).toBe(false);
    });
  });

  it('getCategoryShortName returns string', () => {
    expect(typeof getCategoryShortName('unknown')).toBe('string');
  });
});
