import { describe, it, expect } from 'vitest';
import { getHotelPhotosToShow } from '../hotelPhotosUtil';

describe('getHotelPhotosToShow', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(getHotelPhotosToShow(null)).toEqual([]);
    expect(getHotelPhotosToShow(undefined)).toEqual([]);
    expect(getHotelPhotosToShow([])).toEqual([]);
  });

  it('returns empty when only the hero is present', () => {
    expect(getHotelPhotosToShow(['hero.jpg'])).toEqual([]);
  });

  it('excludes the hero (images[0]) and dedupes', () => {
    const result = getHotelPhotosToShow([
      'hero.jpg',
      'hero.jpg', // dup of hero — drop
      'a.jpg',
      'a.jpg', // dup of a — drop
      'b.jpg',
    ]);
    expect(result).toEqual(['a.jpg', 'b.jpg']);
  });

  it('skips falsy entries', () => {
    const result = getHotelPhotosToShow(['hero.jpg', '', 'a.jpg']);
    expect(result).toEqual(['a.jpg']);
  });
});
