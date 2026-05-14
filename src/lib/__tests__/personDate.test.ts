import { describe, it, expect } from 'vitest';
import { formatPersonDate, isoDateAttr } from '../personDate';

describe('formatPersonDate', () => {
  it('spells the month out (no slashes)', () => {
    const out = formatPersonDate('1951-07-02');
    expect(out).not.toBeNull();
    expect(out!).not.toContain('/');
    // Month name varies by locale but should always include letters.
    expect(out!).toMatch(/[A-Za-z]/);
  });

  it('returns null for invalid input', () => {
    expect(formatPersonDate('not-a-date')).toBeNull();
    expect(formatPersonDate(null)).toBeNull();
    expect(formatPersonDate('')).toBeNull();
    expect(formatPersonDate(undefined)).toBeNull();
  });
});

describe('isoDateAttr', () => {
  it('extracts YYYY-MM-DD from an ISO string', () => {
    expect(isoDateAttr('1951-07-02')).toBe('1951-07-02');
    expect(isoDateAttr('1951-07-02T00:00:00.000Z')).toBe('1951-07-02');
  });

  it('returns null for invalid input', () => {
    expect(isoDateAttr('not-a-date')).toBeNull();
    expect(isoDateAttr(null)).toBeNull();
  });
});
