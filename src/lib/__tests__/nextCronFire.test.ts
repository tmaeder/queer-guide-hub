/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { nextCronFire, formatNextFire } from '../nextCronFire';

const REF = new Date(Date.UTC(2026, 4, 23, 12, 0, 0)); // 2026-05-23 12:00 UTC

describe('nextCronFire', () => {
  it('returns next daily fire after now (03:30 UTC pattern)', () => {
    const next = nextCronFire('30 3 * * *', REF);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe('2026-05-24T03:30:00.000Z');
  });

  it('returns next same-day fire when current time precedes it', () => {
    const noon = new Date(Date.UTC(2026, 4, 23, 1, 0, 0));
    const next = nextCronFire('30 3 * * *', noon);
    expect(next!.toISOString()).toBe('2026-05-23T03:30:00.000Z');
  });

  it('handles */15 minute step', () => {
    const next = nextCronFire('*/15 * * * *', new Date(Date.UTC(2026, 4, 23, 12, 1, 0)));
    expect(next!.toISOString()).toBe('2026-05-23T12:15:00.000Z');
  });

  it('returns null for invalid expression', () => {
    expect(nextCronFire('invalid')).toBeNull();
    expect(nextCronFire('')).toBeNull();
    expect(nextCronFire(null)).toBeNull();
  });

  it('returns null for unsupported syntax (ranges)', () => {
    expect(nextCronFire('0 9-17 * * *', REF)).toBeNull();
  });
});

describe('formatNextFire', () => {
  it("'in Xm' under one hour", () => {
    const out = formatNextFire('25 12 * * *', new Date(Date.UTC(2026, 4, 23, 12, 0, 0)));
    expect(out).toBe('in 25m');
  });

  it("'in Xh Ym' under 24h", () => {
    const out = formatNextFire('30 15 * * *', new Date(Date.UTC(2026, 4, 23, 12, 0, 0)));
    expect(out).toBe('in 3h 30m');
  });

  it("absolute label beyond 24h", () => {
    // From 02:00 on May 23, next 03:30 is 25h 30m later (May 24 03:30 UTC).
    const out = formatNextFire('30 3 * * *', new Date(Date.UTC(2026, 4, 23, 2, 0, 0)));
    expect(out).toBe('in 1h 30m');
  });

  it("absolute label for monthly cron from mid-month", () => {
    // Cron fires 1st of each month; from May 23 → June 1, ~9 days away.
    const out = formatNextFire('0 0 1 * *', new Date(Date.UTC(2026, 4, 23, 12, 0, 0)));
    expect(out).toBe('Jun 1 · 00:00 UTC');
  });

  it("'—' for invalid expression", () => {
    expect(formatNextFire('garbage')).toBe('—');
    expect(formatNextFire(null)).toBe('—');
  });
});
