import { describe, it, expect } from 'vitest';
import { getTripPhase, phaseLabel, phaseStatusText, daysFromToday } from '../tripPhase';
import type { Trip } from '@/hooks/useTrips';

const NOW = new Date('2026-04-18T12:00:00Z');

function trip(partial: Partial<Trip>): Pick<Trip, 'status' | 'start_date' | 'end_date'> {
  return {
    status: 'planning',
    start_date: null,
    end_date: null,
    ...partial,
  };
}

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
    expect(
      getTripPhase(trip({ start_date: '2026-06-01', end_date: '2026-06-08' }), NOW),
    ).toBe('plan');
  });
  it('countdown: within 14 days but not started', () => {
    expect(
      getTripPhase(trip({ start_date: '2026-04-25', end_date: '2026-04-30' }), NOW),
    ).toBe('countdown');
  });
  it('live: today is within trip range', () => {
    expect(
      getTripPhase(trip({ start_date: '2026-04-15', end_date: '2026-04-22' }), NOW),
    ).toBe('live');
  });
  it('live: status === active overrides date check', () => {
    expect(getTripPhase(trip({ status: 'active' }), NOW)).toBe('live');
  });
  it('memory: end_date in past', () => {
    expect(
      getTripPhase(trip({ start_date: '2026-04-01', end_date: '2026-04-10' }), NOW),
    ).toBe('memory');
  });
  it('memory: status archived even with future dates', () => {
    expect(
      getTripPhase(trip({ status: 'archived', start_date: '2026-12-01' }), NOW),
    ).toBe('memory');
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
    expect(
      phaseStatusText(trip({ start_date: '2026-04-15', end_date: '2026-04-22' }), NOW),
    ).toBe('Day 4 of 8');
  });
  it('memory: N days ago', () => {
    expect(
      phaseStatusText(trip({ start_date: '2026-04-01', end_date: '2026-04-10' }), NOW),
    ).toBe('8 days ago');
  });
  it('memory: yesterday', () => {
    expect(
      phaseStatusText(trip({ start_date: '2026-04-10', end_date: '2026-04-17' }), NOW),
    ).toBe('Yesterday');
  });
});
