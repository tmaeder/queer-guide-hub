import { describe, it, expect } from 'vitest';
import { getRandomFallbackImage } from '../fallbackImages';

describe('fallbackImages', () => {
  it('returns a string', () => {
    expect(typeof getRandomFallbackImage()).toBe('string');
  });
});
