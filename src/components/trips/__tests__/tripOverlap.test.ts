import { describe, it, expect } from 'vitest';
import { rangesOverlap } from '../tripOverlap';

describe('rangesOverlap', () => {
  it('returns true when event sits entirely inside trip', () => {
    expect(
      rangesOverlap(
        { start_date: '2026-06-15', end_date: '2026-06-15' },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(true);
  });

  it('returns true when event partially overlaps trip start', () => {
    expect(
      rangesOverlap(
        { start_date: '2026-06-08', end_date: '2026-06-12' },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(true);
  });

  it('returns true when event partially overlaps trip end', () => {
    expect(
      rangesOverlap(
        { start_date: '2026-06-18', end_date: '2026-06-25' },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(true);
  });

  it('returns true when event abuts trip start (inclusive)', () => {
    expect(
      rangesOverlap(
        { start_date: '2026-06-10' },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(true);
  });

  it('returns false when event ends before trip starts', () => {
    expect(
      rangesOverlap(
        { start_date: '2026-06-01', end_date: '2026-06-09' },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(false);
  });

  it('returns false when event starts after trip ends', () => {
    expect(
      rangesOverlap(
        { start_date: '2026-06-21', end_date: '2026-06-25' },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(false);
  });

  it('treats single-day event with no end_date as start_date', () => {
    expect(
      rangesOverlap(
        { start_date: '2026-06-15', end_date: null },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(true);
  });

  it('returns false when either range lacks start_date', () => {
    expect(
      rangesOverlap(
        { start_date: null, end_date: '2026-06-20' },
        { start_date: '2026-06-10', end_date: '2026-06-20' },
      ),
    ).toBe(false);
    expect(
      rangesOverlap(
        { start_date: '2026-06-10', end_date: '2026-06-20' },
        { start_date: undefined, end_date: '2026-06-20' },
      ),
    ).toBe(false);
  });
});
