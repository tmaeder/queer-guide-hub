import { describe, it, expect } from 'vitest';
import { USERNAME_RE, usernameFormatError } from '@/components/auth/UsernameSelector';

const valid = (v: string) => USERNAME_RE.test(v) && !/[._]{2}/.test(v);

describe('username v2 format', () => {
  it('accepts the relaxed format', () => {
    expect(valid('mariposa')).toBe(true);
    expect(valid('mari.posa')).toBe(true);
    expect(valid('mari_posa9')).toBe(true);
    expect(valid('abc')).toBe(true);
    expect(valid('a2345678901234567890'.slice(0, 20))).toBe(true);
  });

  it('grandfathers old-format usernames after lowercase fold', () => {
    expect(valid('TobiMaeder1'.toLowerCase())).toBe(true);
    expect(valid('queertravel2026'.toLowerCase())).toBe(true);
  });

  it('rejects bad shapes', () => {
    expect(valid('ab')).toBe(false); // too short
    expect(valid('a'.repeat(21))).toBe(false); // too long
    expect(valid('1mari')).toBe(false); // digit start
    expect(valid('_mari')).toBe(false); // separator start
    expect(valid('mari_')).toBe(false); // separator end
    expect(valid('mari..posa')).toBe(false); // consecutive separators
    expect(valid('mari_.posa')).toBe(false);
    expect(valid('Mari')).toBe(false); // uppercase (lowercase-only storage)
    expect(valid('mari posa')).toBe(false); // space
    expect(valid('marí')).toBe(false); // non-ASCII (homoglyph defense)
  });

  it('names the violated rule', () => {
    expect(usernameFormatError('ab')).toMatch(/at least 3/i);
    expect(usernameFormatError('a'.repeat(21))).toMatch(/at most 20/i);
    expect(usernameFormatError('1mari')).toMatch(/start with a letter/i);
    expect(usernameFormatError('mari_')).toMatch(/end with a letter or number/i);
    expect(usernameFormatError('mari..posa')).toMatch(/repeated/i);
    expect(usernameFormatError('mariposa')).toBeNull();
  });
});
