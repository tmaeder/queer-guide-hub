import { describe, it, expect } from 'vitest';
import { resolveType, toIndexKeys, supportsPriceSort } from '../searchTaxonomy';

// P3-12 / P0-3: taxonomy is the single contract between UI ids, worker
// indexKeys and per-result `type` strings. These tests pin the alias mappings
// so any drift fails CI before it reaches production.
describe('searchTaxonomy', () => {
  it('resolves singular and plural variants of a type to a single canonical id', () => {
    expect(resolveType('venue')).toBe('venue');
    expect(resolveType('venues')).toBe('venue');
    expect(resolveType('personalities')).toBe('personality');
    expect(resolveType('user')).toBe('personality'); // legacy alias
  });

  it('returns null for unknown types so callers can default safely', () => {
    expect(resolveType(undefined)).toBeNull();
    expect(resolveType('')).toBeNull();
    expect(resolveType('mystery')).toBeNull();
  });

  it('maps UI ids to worker index keys, dropping unknown ids', () => {
    expect(toIndexKeys(['venue', 'event'])).toEqual(['venues', 'events']);
    expect(toIndexKeys(['venue', 'mystery'])).toEqual(['venues']);
  });

  // P2-11: price-sort visibility derives from the active type set.
  it('only allows price sort for type sets where every type supports it', () => {
    expect(supportsPriceSort(['event'])).toBe(true);
    expect(supportsPriceSort(['marketplace'])).toBe(true);
    expect(supportsPriceSort(['event', 'marketplace'])).toBe(true);
    expect(supportsPriceSort(['venue'])).toBe(false);
    expect(supportsPriceSort(['event', 'venue'])).toBe(false);
    expect(supportsPriceSort(undefined)).toBe(false);
    expect(supportsPriceSort([])).toBe(false);
  });
});
