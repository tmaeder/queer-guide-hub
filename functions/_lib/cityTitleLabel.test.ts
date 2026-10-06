import { describe, it, expect } from 'vitest';
import { cityTitleLabel } from './detail';

describe('cityTitleLabel', () => {
  it('adds the region only when a same-name sibling exists', () => {
    expect(cityTitleLabel('Portland', 'Maine', 'US-ME', true)).toBe('Portland, Maine');
    expect(cityTitleLabel('Portland', 'Oregon', 'US-OR', true)).toBe('Portland, Oregon');
    expect(cityTitleLabel('Burbank', 'California', 'US-CA', false)).toBe('Burbank');
  });

  it('falls back to the ISO suffix when region_name is empty or numeric', () => {
    expect(cityTitleLabel('Springfield', null, 'US-MO', true)).toBe('Springfield, MO');
    expect(cityTitleLabel('Springfield', '27', 'US-MO', true)).toBe('Springfield, MO');
  });

  it('never adds a numeric code or repeats the city name', () => {
    expect(cityTitleLabel('Hamburg', 'Hamburg', 'DE-HH', true)).toBe('Hamburg, HH');
    expect(cityTitleLabel('X', null, 'BR-27', true)).toBe('X');
    expect(cityTitleLabel('X', null, null, true)).toBe('X');
  });
});
