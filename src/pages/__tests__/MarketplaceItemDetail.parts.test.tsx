/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { productEyebrow } from '../MarketplaceItemDetail.parts';
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
});
