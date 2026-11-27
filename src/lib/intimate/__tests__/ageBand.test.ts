import { describe, it, expect } from 'vitest';
import { ageBandFromDob, ageFromDob } from '../ageBand';

const now = new Date(2026, 10, 20); // 20 Nov 2026

describe('ageBandFromDob', () => {
  it('counts a birthday not yet reached this year', () => {
    expect(ageFromDob('1996-11-21', now)).toBe(29);
    expect(ageFromDob('1996-11-20', now)).toBe(30);
  });
  it('maps ages to bands, including the edges', () => {
    expect(ageBandFromDob('2008-11-20', now)).toBe('18');
    expect(ageBandFromDob('2006-11-20', now)).toBe('19-20');
    expect(ageBandFromDob('1996-11-20', now)).toBe('30-34');
    expect(ageBandFromDob('1950-01-01', now)).toBe('70+');
  });
  it('returns null under 18 or without a date', () => {
    expect(ageBandFromDob('2010-01-01', now)).toBeNull();
    expect(ageBandFromDob('', now)).toBeNull();
  });
});
