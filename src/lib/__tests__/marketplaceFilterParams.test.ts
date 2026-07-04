import { describe, it, expect } from 'vitest';
import {
  parseFiltersFromParams,
  filtersToParams,
  parsePriceToken,
  priceToToken,
  countActiveFilters,
  hasActiveFilters,
  isAttributeTag,
  PRICE_CEILING,
} from '../marketplaceFilterParams';

describe('marketplaceFilterParams', () => {
  it('parses an empty param set to default filters', () => {
    const f = parseFiltersFromParams(new URLSearchParams());
    expect(f.search).toBeUndefined();
    expect(f.availability).toBe('in_stock');
    expect(hasActiveFilters(f)).toBe(false);
  });

  it('round-trips a full filter set through the URL', () => {
    const sp = new URLSearchParams({
      q: 'harness',
      dept: 'apparel',
      cat: 'underwear',
      loc: 'Berlin',
      price: '25-75',
      owned: 'queer_owned,trans_owned',
      tags: 'occ-pride,mat-cotton',
      cur: 'EUR',
      avail: 'any',
      verified: '90',
    });
    const f = parseFiltersFromParams(sp);
    expect(f).toMatchObject({
      search: 'harness',
      department: 'apparel',
      subcategory: 'underwear',
      location: 'Berlin',
      priceRange: { min: 25, max: 75 },
      communityOwned: ['queer_owned', 'trans_owned'],
      tags: ['occ-pride', 'mat-cotton'],
      currency: 'EUR',
      availability: 'any',
      verifiedWithinDays: 90,
    });
    const back = filtersToParams(f);
    const reparsed = parseFiltersFromParams(
      new URLSearchParams(
        Object.entries(back).filter((e): e is [string, string] => Boolean(e[1])),
      ),
    );
    expect(reparsed).toEqual(f);
  });

  it('strips tsquery-breaking characters from q', () => {
    const f = parseFiltersFromParams(new URLSearchParams({ q: 'leather (harness), black' }));
    expect(f.search).toBe('leather  harness   black');
  });

  it('price tokens: open-ended and bounded', () => {
    expect(parsePriceToken('200-')).toEqual({ min: 200, max: PRICE_CEILING });
    expect(parsePriceToken('0-25')).toEqual({ min: 0, max: 25 });
    expect(parsePriceToken('junk')).toBeUndefined();
    expect(parsePriceToken('50-10')).toBeUndefined();
    expect(priceToToken({ min: 200, max: PRICE_CEILING })).toBe('200-');
    expect(priceToToken({ min: 25, max: 75 })).toBe('25-75');
  });

  it('does not encode defaults (in_stock, boutique-era noise)', () => {
    const params = filtersToParams({ availability: 'in_stock' });
    expect(params.avail).toBeUndefined();
    expect(Object.values(params).filter(Boolean)).toHaveLength(0);
  });

  it('counts active filters per dimension, tags individually', () => {
    expect(
      countActiveFilters({
        search: 'x',
        tags: ['a', 'b'],
        communityOwned: ['queer_owned'],
        availability: 'any',
      }),
    ).toBe(5);
  });

  it('identifies namespaced attribute tags', () => {
    expect(isAttributeTag('mat-cotton')).toBe(true);
    expect(isAttributeTag('occ-pride')).toBe(true);
    expect(isAttributeTag('vibe-minimal')).toBe(true);
    expect(isAttributeTag('queer-books')).toBe(false);
  });
});
