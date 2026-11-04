import { describe, expect, it } from 'vitest';
import { trimTrailingSlashes } from '../trimTrailingSlashes';

describe('trimTrailingSlashes', () => {
  it.each([
    ['', ''],
    ['/', ''],
    ['///', ''],
    ['https://x.supabase.co', 'https://x.supabase.co'],
    ['https://x.supabase.co/', 'https://x.supabase.co'],
    ['https://x.supabase.co//', 'https://x.supabase.co'],
    ['/api/v1/pages/', '/api/v1/pages'],
    ['a/b/c', 'a/b/c'],
  ])('%j -> %j', (input, expected) => {
    expect(trimTrailingSlashes(input)).toBe(expected);
  });

  it('is linear on a long run of slashes that does not end the string', () => {
    const evil = '/'.repeat(200_000) + 'x';
    const t0 = performance.now();
    expect(trimTrailingSlashes(evil)).toBe(evil);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
