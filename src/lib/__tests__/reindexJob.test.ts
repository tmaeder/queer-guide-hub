import { describe, it, expect } from 'vitest';
import {
  formatJobDuration,
  normalizeErrors,
  jobProgressPercent,
  anyJobInFlight,
} from '../reindexJob';

describe('formatJobDuration', () => {
  it('returns em dash when no start', () => {
    expect(formatJobDuration(null, null)).toBe('—');
  });

  it('returns ms for sub-second durations', () => {
    expect(
      formatJobDuration('2026-04-28T00:00:00Z', '2026-04-28T00:00:00.500Z'),
    ).toBe('500ms');
  });

  it('returns seconds for sub-minute durations', () => {
    expect(formatJobDuration('2026-04-28T00:00:00Z', '2026-04-28T00:00:42Z')).toBe('42.0s');
  });

  it('returns m s for minute+ durations', () => {
    expect(formatJobDuration('2026-04-28T00:00:00Z', '2026-04-28T00:03:25Z')).toBe('3m 25s');
  });

  it('uses now() when end is null (running jobs)', () => {
    const fixedNow = new Date('2026-04-28T00:00:30Z').getTime();
    expect(formatJobDuration('2026-04-28T00:00:00Z', null, () => fixedNow)).toBe('30.0s');
  });

  it('handles invalid start gracefully', () => {
    expect(formatJobDuration('not-a-date', '2026-04-28T00:00:30Z')).toBe('—');
  });

  it('clamps negative durations to 0ms', () => {
    expect(formatJobDuration('2026-04-28T00:00:30Z', '2026-04-28T00:00:00Z')).toBe('0ms');
  });
});

describe('normalizeErrors', () => {
  it('returns empty array for null/undefined', () => {
    expect(normalizeErrors(null)).toEqual([]);
    expect(normalizeErrors(undefined)).toEqual([]);
  });

  it('returns empty array for non-array, non-string', () => {
    expect(normalizeErrors(42)).toEqual([]);
    expect(normalizeErrors(false)).toEqual([]);
  });

  it('wraps a single string', () => {
    expect(normalizeErrors('boom')).toEqual(['boom']);
  });

  it('passes through string array', () => {
    expect(normalizeErrors(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('stringifies non-string array entries', () => {
    expect(normalizeErrors([{ code: 'x' }])).toEqual(['{"code":"x"}']);
  });
});

describe('jobProgressPercent', () => {
  it('returns null when total is 0', () => {
    expect(jobProgressPercent({ total: 0, processed: 0 })).toBeNull();
  });

  it('returns rounded percent', () => {
    expect(jobProgressPercent({ total: 100, processed: 33 })).toBe(33);
    expect(jobProgressPercent({ total: 3, processed: 1 })).toBe(33);
  });

  it('clamps over-100 to 100', () => {
    expect(jobProgressPercent({ total: 10, processed: 25 })).toBe(100);
  });

  it('clamps negatives to 0', () => {
    expect(jobProgressPercent({ total: 10, processed: -5 })).toBe(0);
  });
});

describe('anyJobInFlight', () => {
  it('returns false for empty list', () => {
    expect(anyJobInFlight([])).toBe(false);
  });

  it('returns true if any pending', () => {
    expect(anyJobInFlight([{ status: 'completed' }, { status: 'pending' }])).toBe(true);
  });

  it('returns true if any running', () => {
    expect(anyJobInFlight([{ status: 'completed' }, { status: 'running' }])).toBe(true);
  });

  it('returns false when all terminal', () => {
    expect(
      anyJobInFlight([
        { status: 'completed' },
        { status: 'failed' },
        { status: 'cancelled' },
      ]),
    ).toBe(false);
  });
});
