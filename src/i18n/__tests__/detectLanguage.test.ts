import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../detectLanguage';

describe('detectLanguage', () => {
  it('returns null for very short input', () => {
    expect(detectLanguage('a')).toBeNull();
  });
  it('returns null for null', () => {
    expect(detectLanguage(null)).toBeNull();
  });
  it('returns a string or null for prose', () => {
    const v = detectLanguage('Bonjour comment allez-vous aujourd hui');
    expect(v === null || typeof v === 'string').toBe(true);
  });
});
