import { describe, it, expect } from 'vitest';
import { getEventLiveState, humanizeGap } from '../event-countdown';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('humanizeGap', () => {
  it('uses the largest natural unit', () => {
    expect(humanizeGap(30_000)).toBe('less than a minute');
    expect(humanizeGap(5 * 60_000)).toBe('5 minutes');
    expect(humanizeGap(60_000)).toBe('1 minute');
    expect(humanizeGap(2 * HOUR)).toBe('2 hours');
    expect(humanizeGap(3 * DAY)).toBe('3 days');
    expect(humanizeGap(DAY)).toBe('1 day');
  });
});

describe('getEventLiveState', () => {
  const now = Date.parse('2026-06-23T12:00:00Z');

  it('counts down an upcoming event', () => {
    const s = getEventLiveState('2026-06-26T12:00:00Z', null, now);
    expect(s.kind).toBe('upcoming');
    expect(s).toMatchObject({ label: 'Starts in 3 days', soon: false });
  });

  it('flags soon when < 24h out', () => {
    const s = getEventLiveState('2026-06-23T18:00:00Z', null, now);
    expect(s).toMatchObject({ kind: 'upcoming', soon: true });
  });

  it('reports happening-now between start and end', () => {
    const s = getEventLiveState('2026-06-23T10:00:00Z', '2026-06-23T14:00:00Z', now);
    expect(s).toEqual({ kind: 'live', label: 'Happening now' });
  });

  it('treats a started event with no end as live for 3h', () => {
    const s = getEventLiveState('2026-06-23T11:00:00Z', null, now);
    expect(s.kind).toBe('live');
  });

  it('reports ended after the end', () => {
    const s = getEventLiveState('2026-06-20T10:00:00Z', '2026-06-20T14:00:00Z', now);
    expect(s).toEqual({ kind: 'ended', label: 'Ended' });
  });

  it('is resilient to an unparseable date', () => {
    const s = getEventLiveState('not-a-date', null, now);
    expect(s.kind).toBe('upcoming');
  });
});
