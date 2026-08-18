/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { productEyebrow, displayBrandOf } from '../MarketplaceItemDetail.parts';
import type { MarketplaceListing } from '../MarketplaceItemDetail.parts';

/**
 * `getBusinessTypeIcon` used to be tested here. It was deleted with the lucide
 * icons when this page moved onto the transit vocabulary — a surface may not
 * mix TransitIcon with lucide, and there is no transit glyph for "online vs
 * physical business". `productEyebrow` is what took its place as the pure,
 * testable part of the header.
 */
const base = { department: null, brand: null } as unknown as MarketplaceListing;

describe('productEyebrow', () => {
  it('joins department and brand with the interpunct', () => {
    expect(productEyebrow({ ...base, department: 'apparel', brand: 'TomboyX' })).toBe(
      'Apparel · TomboyX',
    );
  });

  it('drops the department when it is the "other" catch-all', () => {
    // `other` is a real slug in DEPARTMENT_ORDER but carries no information —
    // showing it would put "Other" in the kicker of every unclassified listing.
    expect(productEyebrow({ ...base, department: 'other', brand: 'TomboyX' })).toBe('TomboyX');
  });

  it('falls back to the surface name rather than an empty kicker', () => {
    expect(productEyebrow(base)).toBe('Marketplace');
  });

  it('prefers the curated brand name over the raw feed value', () => {
    expect(productEyebrow({ ...base, department: 'apparel', brand: 'tomboyx' }, 'TomboyX')).toBe(
      'Apparel · TomboyX',
    );
  });
});

/**
 * The real rows this exists for, measured 2026-08-15: 1,251 active listings
 * across 7 brands whose feed `brand` disagrees with the curated
 * `display_name`, 1,204 of them by case alone.
 */
describe('displayBrandOf', () => {
  it.each([
    ['tomboyx', 'TomboyX'],
    ['OXBALLS', 'Oxballs'],
    ['CELLBLOCK 13', 'CellBlock 13'],
    ['Forttroff', 'Fort Troff'],
  ])('prefers curated "%s" → "%s"', (raw, curated) => {
    expect(displayBrandOf({ ...base, brand: raw }, curated)).toBe(curated);
  });

  it('falls back to the feed value when no brand row is curated', () => {
    // 53,822 of the 59,239 listings with a brand have no approved brand row —
    // the fallback is the common path, not an edge case.
    expect(displayBrandOf({ ...base, brand: 'Some Indie Label' }, null)).toBe('Some Indie Label');
  });

  it('returns null rather than an empty string when neither exists', () => {
    expect(displayBrandOf(base, null)).toBeNull();
  });
});
