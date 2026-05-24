import { describe, it, expect } from 'vitest';
import { buildPrideByCity, formatPrideDate } from '@/utils/prideForCity';

const NOW = new Date('2026-06-01T00:00:00Z');

const e = (overrides: Partial<{ start_date: string; city_id: string | null; title: string }>) => ({
  start_date: '2026-07-01T00:00:00Z',
  city_id: 'berlin',
  title: 'Berlin Pride',
  ...overrides,
});

describe('buildPrideByCity', () => {
  it('includes events within the window', () => {
    const map = buildPrideByCity([e({ city_id: 'berlin', start_date: '2026-07-26T00:00:00Z' })], NOW);
    expect(map.size).toBe(1);
    expect(map.get('berlin')?.title).toBe('Berlin Pride');
  });

  it('skips events without a city_id', () => {
    expect(buildPrideByCity([e({ city_id: null })], NOW).size).toBe(0);
  });

  it('skips events that have already started', () => {
    expect(
      buildPrideByCity([e({ start_date: '2026-05-15T00:00:00Z' })], NOW).size,
    ).toBe(0);
  });

  it('skips events past the window end', () => {
    expect(
      buildPrideByCity([e({ start_date: '2026-11-01T00:00:00Z' })], NOW, 90).size,
    ).toBe(0);
  });

  it('keeps only the soonest upcoming pride per city', () => {
    const map = buildPrideByCity(
      [
        e({ city_id: 'berlin', start_date: '2026-08-20T00:00:00Z', title: 'CSD' }),
        e({ city_id: 'berlin', start_date: '2026-07-26T00:00:00Z', title: 'Pride' }),
        e({ city_id: 'madrid', start_date: '2026-07-04T00:00:00Z', title: 'Orgullo' }),
      ],
      NOW,
    );
    expect(map.get('berlin')?.title).toBe('Pride');
    expect(map.get('madrid')?.title).toBe('Orgullo');
  });

  it('honors a custom window', () => {
    const map = buildPrideByCity(
      [e({ start_date: '2026-08-10T00:00:00Z' })],
      NOW,
      30,
    );
    expect(map.size).toBe(0);
  });

  it('ignores events with invalid start_date', () => {
    expect(buildPrideByCity([e({ start_date: 'not-a-date' })], NOW).size).toBe(0);
  });
});

describe('formatPrideDate', () => {
  it('produces a short month/day label', () => {
    expect(formatPrideDate(new Date('2026-07-26T00:00:00Z'), 'en-US')).toMatch(/Jul/);
  });
});
