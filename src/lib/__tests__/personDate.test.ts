import { describe, it, expect } from 'vitest';
import { formatPersonDate, formatPersonDateRange, isoDateAttr } from '../personDate';

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

describe('formatPersonDateRange', () => {
  it('downgrades both sides to year-only when both are YYYY-01-01', () => {
    const out = formatPersonDateRange('1885-01-01', '1959-01-01');
    expect(out.precision).toBe('year');
    expect(out.birth).toBe('1885');
    expect(out.death).toBe('1959');
  });

  it('keeps full long format when one side has a real month-day (Hirschfeld)', () => {
    const out = formatPersonDateRange('1868-05-14', '1935-05-14');
    expect(out.precision).toBe('day');
    expect(out.birth).not.toBeNull();
    expect(out.death).not.toBeNull();
    expect(out.birth!).toMatch(/[A-Za-z]/);
    expect(out.death!).toMatch(/[A-Za-z]/);
    expect(out.birth!).not.toBe('1868');
    expect(out.death!).not.toBe('1935');
  });

  it('does not downgrade a single YYYY-01-01 when the other side is null', () => {
    const out = formatPersonDateRange('1885-01-01', null);
    expect(out.precision).toBe('day');
    expect(out.birth).not.toBeNull();
    expect(out.birth!).toMatch(/[A-Za-z]/);
    expect(out.death).toBeNull();
  });

  it('returns nulls for both sides when both inputs are null', () => {
    const out = formatPersonDateRange(null, null);
    expect(out.precision).toBe('day');
    expect(out.birth).toBeNull();
    expect(out.death).toBeNull();
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
