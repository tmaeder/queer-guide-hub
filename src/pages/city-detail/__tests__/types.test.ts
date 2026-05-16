import { describe, it, expect } from 'vitest';
import { formatPopulation } from '../types';

describe('formatPopulation', () => {
  it('formats large numbers', () => {
    expect(typeof formatPopulation(1000000)).toBe('string');
  });
});
