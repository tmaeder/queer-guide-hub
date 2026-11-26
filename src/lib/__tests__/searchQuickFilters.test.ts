import { describe, it, expect } from 'vitest';
import { isRange, todayRange, weekendRange } from '../searchQuickFilters';

const d = (iso: string) => new Date(`${iso}T12:00:00`);
const day = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;

describe('searchQuickFilters', () => {
  it('today spans the whole day', () => {
    const [from, to] = todayRange(d('2026-11-26'));
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(day(from)).toBe(day(to));
  });

  it.each([
    ['2026-11-26', '2026-11-28', '2026-11-29'], // Thursday → next Sat–Sun
    ['2026-11-28', '2026-11-28', '2026-11-29'], // Saturday → today–Sunday
    ['2026-11-29', '2026-11-29', '2026-11-29'], // Sunday → just today
    ['2026-11-30', '2026-12-5', '2026-12-6'], // Monday → the coming weekend
  ])('weekend from %s is %s to %s', (now, from, to) => {
    const [a, b] = weekendRange(d(now));
    expect(day(a)).toBe(day(d(from.replace(/-(\d)$/, '-0$1'))));
    expect(day(b)).toBe(day(d(to.replace(/-(\d)$/, '-0$1'))));
  });

  it('matches a range by day, not by millisecond', () => {
    const range = weekendRange(d('2026-11-26'));
    expect(isRange({ dateRange: [d('2026-11-28'), d('2026-11-29')] }, range)).toBe(true);
    expect(isRange({ dateRange: todayRange(d('2026-11-26')) }, range)).toBe(false);
    expect(isRange({}, range)).toBe(false);
  });
});
