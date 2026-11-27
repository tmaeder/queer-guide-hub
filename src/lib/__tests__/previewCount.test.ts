import { describe, expect, it } from 'vitest';
import { formatCount, previewCount } from '../previewCount';

describe('previewCount', () => {
  it('reports a subset of a larger total', () => {
    // /tags/queer-friendly, prod 2026-11-27: 31,659 venues, preview of 6.
    expect(previewCount(6, 31659)).toEqual({ shown: 6, total: 31659, partial: true });
  });

  it('never reports a total smaller than what is shown', () => {
    expect(previewCount(6, 4)).toEqual({ shown: 6, total: 6, partial: false });
    expect(previewCount(3, null)).toEqual({ shown: 3, total: 3, partial: false });
  });
});

describe('formatCount', () => {
  it('groups digits for the locale', () => {
    expect(formatCount(31659, 'en')).toBe('31,659');
    expect(formatCount(31659, 'de')).toBe('31.659');
    expect(formatCount(31659, 'not-a-locale!!')).toBe('31,659');
  });
});
