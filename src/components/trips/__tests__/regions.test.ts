import { describe, it, expect } from 'vitest';
import { regionFromCountry, regionLabel, REGION_ORDER } from '../regions';

describe('regions', () => {
  it('regionFromCountry returns a region', () => {
    expect(typeof regionFromCountry('US')).toBe('string');
    expect(typeof regionFromCountry(null)).toBe('string');
  });
  it('regionLabel returns string', () => {
    for (const r of REGION_ORDER) expect(typeof regionLabel(r)).toBe('string');
  });
});
