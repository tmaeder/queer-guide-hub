import { describe, it, expect } from 'vitest';
import { getFallbackImage, getRandomFallbackImage, FALLBACK_IMAGES } from '../fallbackImages';

describe('fallbackImages', () => {
  it('returns a string from the curated pool', () => {
    expect(FALLBACK_IMAGES).toContain(getRandomFallbackImage());
    expect(FALLBACK_IMAGES).toContain(getFallbackImage('venue', 'abc'));
  });

  it('is deterministic for the same (theme, key)', () => {
    expect(getFallbackImage('venue', 'abc')).toBe(getFallbackImage('venue', 'abc'));
    expect(getFallbackImage('event', 'xyz-123')).toBe(getFallbackImage('event', 'xyz-123'));
  });

  it('keyless calls are stable (never random)', () => {
    expect(getFallbackImage('venue')).toBe(getFallbackImage('venue'));
    expect(getRandomFallbackImage()).toBe(getRandomFallbackImage());
  });

  it('varies the image across themes for the same key', () => {
    // Over many keys, venue and event lanes should diverge for most of them.
    const keys = Array.from({ length: 50 }, (_, i) => `entity-${i}`);
    const diffs = keys.filter((k) => getFallbackImage('venue', k) !== getFallbackImage('event', k));
    expect(diffs.length).toBeGreaterThan(keys.length / 2);
  });

  it('every returned image is a member of the pool', () => {
    const themes = ['venue', 'event', 'hotel', 'place', 'person', 'news', 'marketplace', 'default'] as const;
    for (const t of themes) {
      for (let i = 0; i < 20; i++) {
        expect(FALLBACK_IMAGES).toContain(getFallbackImage(t, `k${i}`));
      }
    }
  });
});
