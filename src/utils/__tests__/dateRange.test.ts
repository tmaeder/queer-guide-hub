import { describe, it, expect } from 'vitest';
import {
  startOfLocalDayISO,
  endOfLocalDayISO,
  normalizeCityLabel,
  dedupeCitiesByNormalized,
} from '../dateRange';

describe('dateRange helpers', () => {
  it('startOfLocalDayISO returns local-midnight boundary', () => {
    const d = new Date(2026, 4, 22, 14, 30, 0); // May 22, 2026 14:30 local
    const iso = startOfLocalDayISO(d);
    const parsed = new Date(iso);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(4);
    expect(parsed.getDate()).toBe(22);
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getMinutes()).toBe(0);
    expect(parsed.getSeconds()).toBe(0);
    expect(parsed.getMilliseconds()).toBe(0);
  });

  it('endOfLocalDayISO returns last-ms-of-day boundary', () => {
    const d = new Date(2026, 4, 29, 9, 0, 0);
    const iso = endOfLocalDayISO(d);
    const parsed = new Date(iso);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(4);
    expect(parsed.getDate()).toBe(29);
    expect(parsed.getHours()).toBe(23);
    expect(parsed.getMinutes()).toBe(59);
    expect(parsed.getSeconds()).toBe(59);
    expect(parsed.getMilliseconds()).toBe(999);
  });

  it('end is strictly greater than start for same day', () => {
    const d = new Date(2026, 4, 22);
    expect(new Date(endOfLocalDayISO(d)).getTime()).toBeGreaterThan(
      new Date(startOfLocalDayISO(d)).getTime(),
    );
  });
});

describe('city normalization', () => {
  it('normalizes accents and case', () => {
    expect(normalizeCityLabel('Zürich')).toBe('zurich');
    expect(normalizeCityLabel('ZURICH')).toBe('zurich');
    expect(normalizeCityLabel('  Zurich  ')).toBe('zurich');
    expect(normalizeCityLabel('São Paulo')).toBe('sao paulo');
  });

  it('dedupes Zurich/Zürich keeping the accented form', () => {
    const result = dedupeCitiesByNormalized(['Zurich', 'Zürich', 'Berlin']);
    expect(result).toContain('Zürich');
    expect(result).not.toContain('Zurich');
    expect(result).toContain('Berlin');
    expect(result.length).toBe(2);
  });

  it('dedupes even when only the unaccented form is present', () => {
    const result = dedupeCitiesByNormalized(['Zurich', 'Berlin']);
    expect(result).toEqual(['Berlin', 'Zurich']);
  });

  it('filters empty and whitespace-only entries', () => {
    const result = dedupeCitiesByNormalized(['', '   ', 'Berlin']);
    expect(result).toEqual(['Berlin']);
  });
});
