import { describe, it, expect } from 'vitest';
import { HOTEL_TYPE_OPTIONS, HOTEL_TYPE_LABEL, HOTEL_PRICE_OPTIONS, HOTEL_PRICE_LABEL } from '../hotelFilterOptions';

describe('hotelFilterOptions', () => {
  it('exports non-empty arrays', () => {
    expect(HOTEL_TYPE_OPTIONS.length).toBeGreaterThan(0);
    expect(HOTEL_PRICE_OPTIONS.length).toBeGreaterThan(0);
  });
  it('label maps match options', () => {
    for (const o of HOTEL_TYPE_OPTIONS) expect(HOTEL_TYPE_LABEL[o.value]).toBe(o.label);
    for (const o of HOTEL_PRICE_OPTIONS) expect(HOTEL_PRICE_LABEL[o.value]).toBe(o.label);
  });
});
