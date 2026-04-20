import { describe, it, expect } from 'vitest';
import { displayCityName } from '../cityDisplay';

describe('displayCityName', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(displayCityName(null, 'en')).toBe('');
    expect(displayCityName(undefined, 'en')).toBe('');
    expect(displayCityName('', 'en')).toBe('');
    expect(displayCityName('   ', 'en')).toBe('');
  });

  it('returns raw value for unknown cities', () => {
    expect(displayCityName('Berlin', 'en')).toBe('Berlin');
    expect(displayCityName('Berlin', 'de')).toBe('Berlin');
  });

  it('canonicalizes Zurich/Zürich based on locale', () => {
    expect(displayCityName('Zurich', 'en')).toBe('Zurich');
    expect(displayCityName('Zürich', 'en')).toBe('Zurich');
    expect(displayCityName('Zurich', 'de')).toBe('Zürich');
    expect(displayCityName('Zürich', 'de')).toBe('Zürich');
  });

  it('canonicalizes Munich/München', () => {
    expect(displayCityName('Munich', 'de')).toBe('München');
    expect(displayCityName('München', 'en')).toBe('Munich');
  });

  it('handles language tags like de-CH', () => {
    expect(displayCityName('Zurich', 'de-CH')).toBe('Zürich');
    expect(displayCityName('Zurich', 'en-US')).toBe('Zurich');
  });

  it('trims whitespace', () => {
    expect(displayCityName('  Zurich  ', 'de')).toBe('Zürich');
  });

  it('falls back to English for unknown locales', () => {
    expect(displayCityName('Zurich', 'fr')).toBe('Zurich');
    expect(displayCityName('Zurich', null)).toBe('Zurich');
  });
});
