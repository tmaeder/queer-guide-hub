import { describe, it, expect } from 'vitest';
import { parseFilters, serializeFilters } from '../personalitiesFilters';

const PROFS = ['Singer', 'Actor', 'Writer'];

describe('parseFilters', () => {
  it('returns defaults for empty params', () => {
    const r = parseFilters(new URLSearchParams(''));
    expect(r.filters.sortBy).toBe('featured');
    expect(r.filters.profession).toBeUndefined();
    expect(r.filters.name_starts_with).toBeUndefined();
    expect(r.filters.exclude_adult).toBe(true);
    expect(r.changed).toBe(false);
  });

  it('drops unknown sort values', () => {
    const r = parseFilters(new URLSearchParams('sort=garbage'));
    expect(r.filters.sortBy).toBe('featured');
    expect(r.changed).toBe(true);
  });

  it('drops unknown letters', () => {
    const r = parseFilters(new URLSearchParams('letter=ZZ'));
    expect(r.filters.name_starts_with).toBeUndefined();
    expect(r.changed).toBe(true);
  });

  it('uppercases single-letter values', () => {
    const r = parseFilters(new URLSearchParams('letter=b'));
    expect(r.filters.name_starts_with).toBe('B');
  });

  it('keeps the # bucket', () => {
    const r = parseFilters(new URLSearchParams('letter=%23'));
    expect(r.filters.name_starts_with).toBe('#');
  });

  it('drops profession not in allowlist', () => {
    const r = parseFilters(new URLSearchParams('profession=Foo'), PROFS);
    expect(r.filters.profession).toBeUndefined();
    expect(r.changed).toBe(true);
  });

  it('keeps profession in allowlist (case-insensitive, canonicalized)', () => {
    const r = parseFilters(new URLSearchParams('profession=singer'), PROFS);
    expect(r.filters.profession).toBe('Singer');
  });

  it('accepts profession unchecked when allowlist is null', () => {
    const r = parseFilters(new URLSearchParams('profession=Anything'));
    expect(r.filters.profession).toBe('Anything');
  });

  it('roundtrips through serializeFilters', () => {
    const orig = new URLSearchParams('sort=za&letter=B&profession=Singer&q=test');
    const { filters, changed } = parseFilters(orig, PROFS);
    expect(changed).toBe(false);
    const out = serializeFilters(filters);
    expect(out.get('sort')).toBe('za');
    expect(out.get('letter')).toBe('B');
    expect(out.get('profession')).toBe('Singer');
    expect(out.get('q')).toBe('test');
  });

  it('drops unknown params via canonicalization', () => {
    const r = parseFilters(new URLSearchParams('utm_source=twitter&sort=az'), PROFS);
    expect(r.changed).toBe(true);
    expect(r.filters.sortBy).toBe('az');
  });

  it('include_adult=1 disables adult exclusion', () => {
    const r = parseFilters(new URLSearchParams('include_adult=1'));
    expect(r.filters.exclude_adult).toBe(false);
  });

  it('serializes status correctly', () => {
    const params = serializeFilters({
      sortBy: 'featured',
      is_living: true,
      exclude_adult: true,
    });
    expect(params.get('status')).toBe('living');
  });

  it('drops empty q', () => {
    const r = parseFilters(new URLSearchParams('q='));
    expect(r.filters.search).toBeUndefined();
  });

  it('clamps overlong q', () => {
    const r = parseFilters(new URLSearchParams('q=' + 'x'.repeat(200)));
    expect(r.filters.search).toBeUndefined();
    expect(r.changed).toBe(true);
  });
});

describe('competed param', () => {
  it('round-trips a category, a slug and "any"', async () => {
    const { parseFilters, serializeFilters } = await import('@/lib/personalitiesFilters');
    for (const v of ['any', 'drag_series', 'rupauls-drag-race-uk']) {
      const { filters, changed } = parseFilters(new URLSearchParams(`competed=${v}`));
      expect(filters.competed_in).toBe(v);
      expect(changed).toBe(false);
      expect(serializeFilters(filters).get('competed')).toBe(v);
    }
  });

  it('drops a malformed value and flags the URL for rewrite', async () => {
    const { parseFilters } = await import('@/lib/personalitiesFilters');
    const { filters, changed } = parseFilters(new URLSearchParams('competed=Not%20A%20Slug'));
    expect(filters.competed_in).toBeUndefined();
    expect(changed).toBe(true);
  });
});
