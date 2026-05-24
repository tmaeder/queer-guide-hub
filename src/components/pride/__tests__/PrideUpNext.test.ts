import { describe, it, expect } from 'vitest';
import { relativeDateLabel } from '../PrideUpNext';

const NOW = new Date('2026-06-01T12:00:00Z').getTime();
const day = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe('relativeDateLabel', () => {
  it('returns "Past" for any past date', () => {
    expect(relativeDateLabel(day(-1), NOW)).toBe('Past');
    expect(relativeDateLabel(day(-30), NOW)).toBe('Past');
  });

  it('returns "Today" for the same day (rounds to 0)', () => {
    expect(relativeDateLabel(day(0), NOW)).toBe('Today');
  });

  it('returns "Tomorrow" for the next day', () => {
    expect(relativeDateLabel(day(1), NOW)).toBe('Tomorrow');
  });

  it('returns "In N days" for 2–6 days', () => {
    expect(relativeDateLabel(day(2), NOW)).toBe('In 2 days');
    expect(relativeDateLabel(day(6), NOW)).toBe('In 6 days');
  });

  it('returns "In N weeks" for 7–29 days', () => {
    expect(relativeDateLabel(day(7), NOW)).toBe('In 1 weeks');
    expect(relativeDateLabel(day(14), NOW)).toBe('In 2 weeks');
    expect(relativeDateLabel(day(28), NOW)).toBe('In 4 weeks');
  });

  it('returns "In N months" for 30–364 days', () => {
    expect(relativeDateLabel(day(30), NOW)).toBe('In 1 months');
    expect(relativeDateLabel(day(90), NOW)).toBe('In 3 months');
    expect(relativeDateLabel(day(300), NOW)).toBe('In 10 months');
  });

  it('returns "In Ny" for 1+ year away', () => {
    expect(relativeDateLabel(day(365), NOW)).toBe('In 1y');
    expect(relativeDateLabel(day(730), NOW)).toBe('In 2y');
  });
});
