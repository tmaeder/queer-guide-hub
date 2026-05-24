import { describe, it, expect } from 'vitest';
import {
  buildEmptyTitle,
  buildLooseningSuggestion,
} from '../marketplaceEmptyState';

describe('buildEmptyTitle', () => {
  it('uses generic noun without filters', () => {
    expect(buildEmptyTitle({})).toBe('No listings.');
  });

  it('combines community-owned tags + city + price ceiling', () => {
    expect(
      buildEmptyTitle({
        communityOwned: ['queer_owned', 'trans_owned'],
        location: 'Berlin',
        priceRange: { min: 0, max: 50 },
      }),
    ).toBe('No queer-owned / trans-owned listings under $50, in Berlin.');
  });

  it('uses subcategory as noun when present', () => {
    expect(buildEmptyTitle({ subcategory: 'fetish_gear', location: 'Paris' })).toBe(
      'No fetish gear in Paris.',
    );
  });

  it('quotes search query', () => {
    expect(buildEmptyTitle({ search: 'leather harness' })).toBe(
      'No listings matching "leather harness".',
    );
  });

  it('omits open-ended price range (max = 100000)', () => {
    expect(buildEmptyTitle({ priceRange: { min: 0, max: 100000 } })).toBe('No listings.');
  });
});

describe('buildLooseningSuggestion', () => {
  it('falls back to generic when no filter to loosen', () => {
    expect(buildLooseningSuggestion({})).toBe('Try broadening your search.');
  });

  it('suggests dropping city first, then price', () => {
    expect(
      buildLooseningSuggestion({
        location: 'Berlin',
        priceRange: { min: 0, max: 50 },
      }),
    ).toBe('Drop the city (Berlin)? Raise the price ceiling?');
  });

  it('caps to two suggestions', () => {
    const out = buildLooseningSuggestion({
      location: 'Berlin',
      priceRange: { min: 0, max: 50 },
      communityOwned: ['queer_owned'],
      subcategory: 'fetish_gear',
      verifiedWithinDays: 30,
      relevanceMin: 0.5,
    });
    expect(out.split('?').filter((s) => s.trim()).length).toBe(2);
  });
});
