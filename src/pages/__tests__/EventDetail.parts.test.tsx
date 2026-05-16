/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { formatEventDate, getPriceDisplay } from '../EventDetail.parts';

describe('EventDetail.parts', () => {
  it('formatEventDate returns string', () => {
    expect(typeof formatEventDate('2026-05-15T00:00:00Z')).toBe('string');
  });
  it('getPriceDisplay returns value', () => {
    expect(getPriceDisplay({ price_min: 0, price_max: 0 } as never)).toBeDefined();
  });
});
