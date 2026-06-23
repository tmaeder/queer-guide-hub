/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  trackRecentlyViewed,
  getRecentlyViewed,
  clearRecentlyViewed,
} from '../recentlyViewed';

describe('recentlyViewed', () => {
  beforeEach(() => {
    clearRecentlyViewed();
    window.localStorage.clear();
  });

  it('round-trips a valid https image', () => {
    trackRecentlyViewed({
      type: 'venue',
      slug: 'the-eagle',
      title: 'The Eagle',
      image: 'https://img.queer.guide/venues/the-eagle.webp',
    });
    const [item] = getRecentlyViewed();
    expect(item.image).toBe('https://img.queer.guide/venues/the-eagle.webp');
  });

  it('scrubs a present-but-invalid stored image to undefined on read', () => {
    // Simulate legacy/corrupt entries written before image guards existed.
    const legacy = [
      { type: 'venue', slug: 'a', title: 'A', image: 'http://insecure.example/x.jpg', ts: 3 },
      { type: 'event', slug: 'b', title: 'B', image: 'https://host.comdata:image/svg+xml,x', ts: 2 },
      { type: 'city', slug: 'c', title: 'C', image: '', ts: 1 },
    ];
    window.localStorage.setItem('qg_recently_viewed', JSON.stringify(legacy));

    const items = getRecentlyViewed();
    expect(items).toHaveLength(3);
    // every invalid image is dropped → rail will render its deterministic fallback
    expect(items.every((it) => it.image === undefined)).toBe(true);
  });

  it('keeps a valid image while scrubbing an invalid one in the same list', () => {
    const mixed = [
      { type: 'venue', slug: 'good', title: 'Good', image: 'https://cdn.example/ok.webp', ts: 2 },
      { type: 'venue', slug: 'bad', title: 'Bad', image: 'not-a-url', ts: 1 },
    ];
    window.localStorage.setItem('qg_recently_viewed', JSON.stringify(mixed));

    const bySlug = Object.fromEntries(getRecentlyViewed().map((it) => [it.slug, it.image]));
    expect(bySlug.good).toBe('https://cdn.example/ok.webp');
    expect(bySlug.bad).toBeUndefined();
  });
});
