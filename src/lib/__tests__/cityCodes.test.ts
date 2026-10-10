import { describe, expect, it } from 'vitest';
import { cityCodesFromRow, cityCodesText } from '@/lib/cityCodes';

describe('cityCodesText', () => {
  it('shows only the region code when it names the country', () => {
    expect(cityCodesText({ countryCode: 'US', regionCode: 'US-ME' })).toBe('US-ME');
  });
  it('marks a missing region instead of dropping it', () => {
    expect(cityCodesText({ countryCode: 'za', regionCode: null })).toBe('ZA · –');
  });
  it('marks both missing', () => {
    expect(cityCodesText({})).toBe('– · –');
  });
});

describe('cityCodesFromRow', () => {
  it('reads an embedded object', () => {
    expect(cityCodesFromRow({ region_code: 'DE-BY', countries: { code: 'DE' } })).toEqual({
      countryCode: 'DE',
      regionCode: 'DE-BY',
    });
  });
  it('reads an embedded array', () => {
    expect(cityCodesFromRow({ countries: [{ code: 'FR' }] })).toEqual({
      countryCode: 'FR',
      regionCode: null,
    });
  });
});
