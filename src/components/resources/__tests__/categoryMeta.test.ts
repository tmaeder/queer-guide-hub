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
  // Every stop under the Sex & Kink line must be listed here BY NAME.
  // The SQL twin unified_tags_recompute_is_adult() carries a parent arm
  // (`or tcp.name = 'Sex & Kink'`) and so picks up a new stop for free.
  // This Set has no parent arm and does NOT inherit, so a stop added to the
  // tree without a line in categoryMeta is adult in the database and
  // un-gated in the UI. That asymmetry is exactly how the two halves drift.
  it.each([
    'Practices & Play',
    'Dynamics & Roles',
    'Fetishes',
    'Gear',
    'Kink Community & Scenes',
    'Positions',
  ])('gates the Sex & Kink stop %s', (stop) => {
    expect(ADULT_CATEGORY_NAMES.has(stop)).toBe(true);
    expect(isAdultCategoryName(stop)).toBe(true);
    expect(isAdultTag({ is_adult: false, category: stop })).toBe(true);
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

    it('still honours the category name when the flag is unset', () => {
      expect(isAdultTag({ category: 'Practices & Play' })).toBe(true);
      expect(isAdultTag({ is_adult: false, category: 'Fetishes' })).toBe(true);
    });

    it('leaves non-adult tags visible', () => {
      expect(isAdultTag({ is_adult: false, category: 'Culture & Community' })).toBe(false);
      expect(isAdultTag({ category: null })).toBe(false);
      expect(isAdultTag({})).toBe(false);
    });
  });

  it('getCategoryShortName returns string', () => {
    expect(typeof getCategoryShortName('unknown')).toBe('string');
  });
});
