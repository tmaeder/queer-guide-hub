import { describe, it, expect } from 'vitest';
import { isOpenNow, hoursDisplay } from './openingHours';

// 2026-06-08 is a Monday (slot day 1), 2026-06-09 a Tuesday (slot day 2).
const monNoon = new Date('2026-06-08T12:00:00');
const monMorning = new Date('2026-06-08T09:00:00');
const tueEarly = new Date('2026-06-09T01:00:00');

describe('isOpenNow', () => {
  it('returns null without usable data', () => {
    expect(isOpenNow(null)).toBeNull();
    expect(isOpenNow({})).toBeNull();
    expect(isOpenNow({ regular: [] })).toBeNull();
    expect(isOpenNow('nonsense')).toBeNull();
  });

  it('is open inside a same-day slot', () => {
    const hours = { regular: [{ day: 1, open: '1000', close: '2200' }] };
    expect(isOpenNow(hours, monNoon)).toBe(true);
  });

  it('is closed before opening', () => {
    const hours = { regular: [{ day: 1, open: '1000', close: '2200' }] };
    expect(isOpenNow(hours, monMorning)).toBe(false);
  });

  it('handles an overnight slot that runs past midnight (+HHMM)', () => {
    // Monday 22:00 → 02:00, checked at Tuesday 01:00.
    const hours = { regular: [{ day: 1, open: '2200', close: '+0200' }] };
    expect(isOpenNow(hours, tueEarly)).toBe(true);
  });

  it('does not report open for an unrelated day', () => {
    const hours = { regular: [{ day: 3, open: '1000', close: '2200' }] };
    expect(isOpenNow(hours, monNoon)).toBe(false);
  });
});

describe('hoursDisplay', () => {
  it('returns the display string when present', () => {
    expect(hoursDisplay({ display: 'Open Daily 10:00-23:59' })).toBe('Open Daily 10:00-23:59');
  });
  it('returns null when absent', () => {
    expect(hoursDisplay({})).toBeNull();
    expect(hoursDisplay(null)).toBeNull();
  });
});
