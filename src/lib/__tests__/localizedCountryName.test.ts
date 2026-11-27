import { describe, expect, it } from 'vitest';
import { localizedCountryName } from '../localizedCountryName';

describe('localized country metadata', () => {
  it('uses the requested locale for recognized English country names', () => {
    expect(localizedCountryName('United States', 'de')).toBe('Vereinigte Staaten');
    expect(localizedCountryName('Germany', 'de')).toBe('Deutschland');
    expect(localizedCountryName('United States', 'fr')).toBe('États-Unis');
    expect(localizedCountryName('United States', 'en')).toBe('United States');
  });
  it('preserves unrecognized and historical values instead of guessing a country', () => {
    expect(localizedCountryName('Kingdom of England', 'de')).toBe('Kingdom of England');
    expect(localizedCountryName('Unverified nationality', 'de')).toBe('Unverified nationality');
    expect(localizedCountryName(undefined, 'de')).toBeUndefined();
  });
});
