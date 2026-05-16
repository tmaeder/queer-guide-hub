/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { getPriceRange, formatHours } from '../VenueDetail.parts';

describe('VenueDetail.parts', () => {
  it('getPriceRange handles null', () => {
    expect(getPriceRange(null)).toBeDefined();
  });
  it('getPriceRange handles number', () => {
    expect(getPriceRange(2)).toBeDefined();
  });
  it('formatHours handles empty', () => {
    expect(formatHours({})).toBeDefined();
  });
});
