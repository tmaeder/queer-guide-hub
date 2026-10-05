import { describe, expect, it } from 'vitest';
import { readAmbientTripRelease } from '../ambientTripFlags';

describe('ambient trip release guard', () => {
  it('defaults to the fully shipped release', () => {
    expect(readAmbientTripRelease(undefined)).toBe(3);
    expect(readAmbientTripRelease('')).toBe(3);
  });

  it.each([
    ['1', 1],
    ['2', 2],
    ['3', 3],
  ])('accepts release %s', (value, expected) => {
    expect(readAmbientTripRelease(value)).toBe(expected);
  });

  it('falls back to release one for malformed configuration', () => {
    expect(readAmbientTripRelease('all')).toBe(1);
    expect(readAmbientTripRelease('0')).toBe(1);
  });
});
