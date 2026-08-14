import { describe, it, expect, afterEach, vi } from 'vitest';
import { isPresetActive, presetRange } from '../mapTime';

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

afterEach(() => {
  vi.useRealTimers();
});

describe('presetRange', () => {
  it('always returns a range that moves forwards', () => {
    // The bug this guards: the previous implementation initialised `end` from
    // *now* and then called `end.setDate(start.getDate() + 1)`. When the coming
    // Saturday fell in the NEXT month, that set a day-of-month inside the
    // CURRENT one — on Mon 2026-08-31 "This weekend" resolved to
    // "Sat 4 Sep → Thu 6 Aug", i.e. backwards, so the filter matched nothing.
    // It broke for a few days every month and failed silently.
    for (const day of [
      '2026-08-26T12:00:00', // Wed, weekend in the same month
      '2026-08-31T12:00:00', // Mon, Saturday is in September
      '2026-09-29T12:00:00', // Tue, Saturday is in October
      '2026-12-30T12:00:00', // Wed, Saturday is next YEAR
      '2026-08-09T12:00:00', // Sunday — "this weekend" is the rest of today
      '2026-02-25T12:00:00', // Wed, across a short month
    ]) {
      at(day);
      for (const key of ['tonight', 'weekend', 'month'] as const) {
        const { start, end } = presetRange(key);
        expect(
          new Date(end).getTime(),
          `${key} on ${day} produced ${start} → ${end}`,
        ).toBeGreaterThan(new Date(start).getTime());
      }
      vi.useRealTimers();
    }
  });

  it('weekend lands on Saturday 00:00 → Sunday 23:59', () => {
    at('2026-08-31T12:00:00'); // Monday
    const { start, end } = presetRange('weekend');
    const s = new Date(start);
    const e = new Date(end);
    expect(s.getDay()).toBe(6); // Saturday
    expect(e.getDay()).toBe(0); // Sunday
    expect(s.getHours()).toBe(0);
    expect(e.getHours()).toBe(23);
    // …and it is the SEPTEMBER weekend, not a stray August date.
    expect(s.getMonth()).toBe(8);
    expect(e.getMonth()).toBe(8);
  });

  it('on a Sunday, "this weekend" is the rest of today', () => {
    at('2026-08-09T12:00:00'); // Sunday
    const { start, end } = presetRange('weekend');
    expect(new Date(start).getDate()).toBe(9);
    expect(new Date(end).getDate()).toBe(9);
  });

  it('tonight ends at midnight today', () => {
    at('2026-08-26T12:00:00');
    const { start, end } = presetRange('tonight');
    expect(new Date(start).getDate()).toBe(26);
    expect(new Date(end).getDate()).toBe(26);
    expect(new Date(end).getHours()).toBe(23);
  });
});

describe('isPresetActive', () => {
  it('recognises its own output and rejects anything else', () => {
    at('2026-08-26T12:00:00');
    expect(isPresetActive('weekend', presetRange('weekend'))).toBe(true);
    expect(isPresetActive('weekend', presetRange('month'))).toBe(false);
    expect(isPresetActive('weekend', undefined)).toBe(false);
  });
});
