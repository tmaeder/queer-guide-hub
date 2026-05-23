import { describe, it, expect } from 'vitest';
import { codeToFlagEmoji } from '../countryFlag';

describe('codeToFlagEmoji', () => {
  it('maps US to the US flag', () => {
    expect(codeToFlagEmoji('US')).toBe('🇺🇸');
  });
  it('lowercases ok', () => {
    expect(codeToFlagEmoji('de')).toBe('🇩🇪');
  });
  it('returns null for invalid input', () => {
    expect(codeToFlagEmoji(null)).toBeNull();
    expect(codeToFlagEmoji('')).toBeNull();
    expect(codeToFlagEmoji('USA')).toBeNull();
    expect(codeToFlagEmoji('1A')).toBeNull();
  });
});
