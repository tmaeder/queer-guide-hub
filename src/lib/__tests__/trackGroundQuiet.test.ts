import { describe, expect, it } from 'vitest';
import { isQuietReadingRoute } from '@/lib/trackGround';

describe('isQuietReadingRoute', () => {
  it('covers the long-form policy pages, with or without a locale', () => {
    for (const p of [
      '/privacy',
      '/terms',
      '/cookies',
      '/dmca',
      '/accessibility',
      '/legal',
      '/de/privacy',
    ]) {
      expect(isQuietReadingRoute(p), p).toBe(true);
    }
  });
  it('leaves other pages alone', () => {
    for (const p of ['/', '/settings/privacy', '/venues/x', '/privacy-hub']) {
      expect(isQuietReadingRoute(p), p).toBe(false);
    }
  });
});
