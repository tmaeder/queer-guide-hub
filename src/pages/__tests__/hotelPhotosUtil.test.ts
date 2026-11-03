import { describe, it, expect } from 'vitest';
import { getHotelGallery, getHotelPhotosToShow } from '../hotelPhotosUtil';

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

describe('getHotelGallery — the real misterb&b shape', () => {
  // `images` for /hotels/double-room-available-798528 on prod, shortened.
  const GET = 'https://www.misterbandb.com/get_image/hosting/';
  const CDN = 'https://res.cloudinary.com/misterbnb/image/upload/';
  const stored = [
    `${GET}if_iw_gte_ih,c_lfill,h_528,w_1000%2Ff_auto,q_auto/33064498.jpg`,
    `${CDN}c_fill,e_auto_brightness,f_auto,fl_lossy,g_face,h_68,q_auto,w_100/v1/hosting/h-host.jpg`,
    `${GET}c_lfill,e_auto_brightness,f_auto,fl_lossy,h_400,q_auto,w_640/33064498.jpg`,
    `${CDN}c_lfill,h_400,w_640/v1/hosting/h-room1.jpg`,
    `${CDN}c_lfill,h_400,w_640/v1/hosting/h-room2.jpg`,
  ];

  it("never shows the host's face thumbnail", () => {
    expect(getHotelGallery(stored).some((u) => u.includes('g_face'))).toBe(false);
  });

  it('leads with a loadable room photo, not the get_image URL', () => {
    expect(getHotelGallery(stored)[0]).toContain('h-room1.jpg');
  });

  it('keeps the get_image photo once, after the Cloudinary photos', () => {
    const g = getHotelGallery(stored);
    expect(g.filter((u) => u.includes('33064498'))).toHaveLength(1);
    expect(g[g.length - 1]).toContain('33064498');
  });

  it('still uses a get_image URL as the hero when it is the only photo', () => {
    expect(getHotelGallery([stored[0]])).toEqual([stored[0]]);
  });
});
