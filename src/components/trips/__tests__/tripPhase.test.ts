import { describe, it, expect } from 'vitest';
import {
  getTripPhase,
  phaseLabel,
  phaseStatusText,
  daysFromToday,
  tripDateKey,
  tripStopTime,
} from '../tripPhase';
import type { Trip } from '@/hooks/useTrips';

const NOW = new Date('2026-04-18T12:00:00Z');

function trip(
  partial: Partial<Trip>,
): Pick<Trip, 'status' | 'start_date' | 'end_date'> & Partial<Pick<Trip, 'timezone'>> {
  return {
    status: 'planning',
    start_date: null,
    end_date: null,
    ...partial,
  };
}

describe('tripDateKey', () => {
  it('keeps the destination day when the device is on the previous calendar date', () => {
    const now = new Date('2026-11-03T23:15:00Z');
    expect(tripDateKey(now, 'Europe/Zurich')).toBe('2026-11-04');
    expect(tripDateKey(now, 'America/Los_Angeles')).toBe('2026-11-03');
  });
  it('keeps both occurrences of the DST fallback hour on the same date', () => {
    expect(tripDateKey(new Date('2026-10-25T00:30:00Z'), 'Europe/Zurich')).toBe('2026-10-25');
    expect(tripDateKey(new Date('2026-10-25T01:30:00Z'), 'Europe/Zurich')).toBe('2026-10-25');
  });
});

describe('tripStopTime', () => {
  it('resolves a stored TIME in the destination zone', () => {
    expect(tripStopTime('2026-11-04', '12:30:00', 'Europe/Zurich')?.toISOString()).toBe(
      '2026-11-04T11:30:00.000Z',
    );
    expect(tripStopTime('2026-11-04', null, 'Europe/Zurich')).toBeNull();
  });

  it('uses the earlier offset for a DST overlap and advances skipped times', () => {
    expect(tripStopTime('2026-10-25', '02:30:00', 'Europe/Zurich')?.toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
    expect(tripStopTime('2026-03-29', '02:30:00', 'Europe/Zurich')?.toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });
});

describe('daysFromToday', () => {
  it('returns 0 for today', () => {
    expect(daysFromToday('2026-04-18', NOW)).toBe(0);
  });
  it('returns positive for future dates', () => {
    expect(daysFromToday('2026-04-25', NOW)).toBe(7);
  });
  it('returns negative for past dates', () => {
    expect(daysFromToday('2026-04-11', NOW)).toBe(-7);
  });
  it('returns null for missing dates', () => {
    expect(daysFromToday(null, NOW)).toBeNull();
    expect(daysFromToday(undefined, NOW)).toBeNull();
  });
});

describe('getTripPhase', () => {
  it('seed: no dates set', () => {
    expect(getTripPhase(trip({}), NOW)).toBe('seed');
  });
  it('plan: dates set, > 14 days out', () => {
    expect(getTripPhase(trip({ start_date: '2026-06-01', end_date: '2026-06-08' }), NOW)).toBe(
      'plan',
    );
  });
  it('countdown: within 14 days but not started', () => {
    expect(getTripPhase(trip({ start_date: '2026-04-25', end_date: '2026-04-30' }), NOW)).toBe(
      'countdown',
    );
  });
  it('live: today is within trip range', () => {
    expect(getTripPhase(trip({ start_date: '2026-04-15', end_date: '2026-04-22' }), NOW)).toBe(
      'live',
    );
  });
  it('live: status === active overrides date check', () => {
    expect(getTripPhase(trip({ status: 'active' }), NOW)).toBe('live');
  });
  it('memory: end_date in past', () => {
    expect(getTripPhase(trip({ start_date: '2026-04-01', end_date: '2026-04-10' }), NOW)).toBe(
      'memory',
    );
  });
  it('memory: status archived even with future dates', () => {
    expect(getTripPhase(trip({ status: 'archived', start_date: '2026-12-01' }), NOW)).toBe(
      'memory',
    );
  });
  it('memory: status completed', () => {
    expect(getTripPhase(trip({ status: 'completed' }), NOW)).toBe('memory');
  });
  it('countdown: tomorrow boundary', () => {
    expect(getTripPhase(trip({ start_date: '2026-04-19' }), NOW)).toBe('countdown');
  });
  it('countdown: 14 days exact boundary', () => {
    expect(getTripPhase(trip({ start_date: '2026-05-02' }), NOW)).toBe('countdown');
  });
  it('plan: 15 days out is past countdown', () => {
    expect(getTripPhase(trip({ start_date: '2026-05-03' }), NOW)).toBe('plan');
  });
  it('uses the destination timezone at the local start-date boundary', () => {
    const boundary = new Date('2026-04-17T22:30:00Z');
    expect(
      getTripPhase(
        trip({ start_date: '2026-04-18', end_date: '2026-04-20', timezone: 'Europe/Zurich' }),
        boundary,
      ),
    ).toBe('live');
    expect(
      getTripPhase(
        trip({ start_date: '2026-04-18', end_date: '2026-04-20', timezone: 'America/Los_Angeles' }),
        boundary,
      ),
    ).toBe('countdown');
  });
});

describe('phaseLabel', () => {
  it('returns human-friendly label', () => {
    expect(phaseLabel('seed')).toBe('Inspiration');
    expect(phaseLabel('plan')).toBe('Planning');
    expect(phaseLabel('countdown')).toBe('Countdown');
    expect(phaseLabel('live')).toBe('Live');
    expect(phaseLabel('memory')).toBe('Memory');
  });
});

describe('phaseStatusText', () => {
  it('seed: dates not set', () => {
    expect(phaseStatusText(trip({}), NOW)).toBe('Dates not set');
  });
  it('plan: in N days', () => {
    expect(phaseStatusText(trip({ start_date: '2026-06-01' }), NOW)).toBe('in 44 days');
  });
  it('countdown: tomorrow', () => {
    expect(phaseStatusText(trip({ start_date: '2026-04-19' }), NOW)).toBe('Tomorrow');
  });
  it('live: Day N of M', () => {
    expect(phaseStatusText(trip({ start_date: '2026-04-15', end_date: '2026-04-22' }), NOW)).toBe(
      'Day 4 of 8',
    );
  });
  it('memory: N days ago', () => {
    expect(phaseStatusText(trip({ start_date: '2026-04-01', end_date: '2026-04-10' }), NOW)).toBe(
      '8 days ago',
    );
  });
  it('memory: yesterday', () => {
    expect(phaseStatusText(trip({ start_date: '2026-04-10', end_date: '2026-04-17' }), NOW)).toBe(
      'Yesterday',
    );
  });
});
