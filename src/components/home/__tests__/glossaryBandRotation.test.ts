import { describe, expect, it } from 'vitest';
import { pickOfTheDay } from '@/hooks/useTagPreviews';

describe('pickOfTheDay', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];

  it('is deterministic for a given date', () => {
    const date = new Date('2026-08-22T10:00:00Z');
    expect(pickOfTheDay(pool, date, 4)).toEqual(pickOfTheDay(pool, date, 4));
  });

  it('rotates on consecutive days and wraps around the pool', () => {
    const day1 = pickOfTheDay(pool, new Date('2026-08-22T00:30:00Z'), 4);
    const day2 = pickOfTheDay(pool, new Date('2026-08-23T23:30:00Z'), 4);
    expect(day2).not.toEqual(day1);
    expect(day2[0]).toBe(day1[1]);
  });

  it('never repeats a term within one day and caps at the pool size', () => {
    const picks = pickOfTheDay(pool, new Date('2026-12-31T12:00:00Z'), 9);
    expect(picks).toHaveLength(pool.length);
    expect(new Set(picks).size).toBe(picks.length);
  });

  it('returns empty for an empty pool', () => {
    expect(pickOfTheDay([], new Date(), 4)).toEqual([]);
  });
});
