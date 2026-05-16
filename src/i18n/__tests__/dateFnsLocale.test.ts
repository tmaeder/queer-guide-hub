import { describe, it, expect } from 'vitest';
import { dateFnsLocaleFor } from '../dateFnsLocale';

describe('dateFnsLocaleFor', () => {
  it('returns a locale for en', () => {
    expect(dateFnsLocaleFor('en')).toBeDefined();
  });
  it('falls back when unknown', () => {
    expect(dateFnsLocaleFor('xx')).toBeDefined();
  });
  it('handles null', () => {
    expect(dateFnsLocaleFor(null)).toBeDefined();
  });
});
