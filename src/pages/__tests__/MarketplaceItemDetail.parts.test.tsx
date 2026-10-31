/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/marketplace/MarketplacePriceHistory', () => ({
  MarketplacePriceHistory: () => null,
}));

import {
  productEyebrow,
  displayBrandOf,
  ProductFacts,
  MarketplaceContent,
} from '../MarketplaceItemDetail.parts';
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

const listing = {
  id: 'l1',
  department: 'underwear',
  subcategory: 'underwear',
  brand: 'RUFSKIN',
  in_stock: true,
  availability: 'in_stock',
  location: null,
  created_at: '2026-10-20T00:00:00Z',
  attributes: {},
  content_rating: 'sfw',
  description: null,
  link_checked_at: null,
} as unknown as MarketplaceListing;

describe('ProductFacts', () => {
  it('does not restate brand, availability or listing date shown elsewhere on the page', () => {
    render(<ProductFacts listing={listing} />);
    expect(screen.getByText('Department')).toBeInTheDocument();
    for (const label of ['Brand', 'Availability', 'Listed']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('drops Category when it only repeats the Department', () => {
    render(<ProductFacts listing={listing} />);
    expect(screen.queryByText('Category')).toBeNull();
  });

  it('keeps Category when it adds something', () => {
    render(<ProductFacts listing={{ ...listing, subcategory: 'jockstraps' }} />);
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('keeps a feed-only availability, which has no masthead chip to live in', () => {
    render(<ProductFacts listing={{ ...listing, in_stock: null, availability: 'preorder' }} />);
    expect(screen.getByText('Availability')).toBeInTheDocument();
    expect(screen.getByText('Preorder')).toBeInTheDocument();
  });
});

describe('MarketplaceContent reviews', () => {
  it('renders no reviews section at all when there are none', () => {
    render(<MarketplaceContent listing={listing} reviews={[]} onContentUpdated={() => {}} />);
    expect(screen.queryByText(/Reviews \(0\)/)).toBeNull();
    expect(screen.queryByText(/No reviews yet/)).toBeNull();
  });
});
