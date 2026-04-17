import { describe, it, expect } from 'vitest';
import { expiryStatus, expiryLabel } from '@/utils/docExpiry';

const NOW = new Date('2026-04-17T12:00:00Z');

const at = (offsetDays: number): string => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

describe('expiryStatus', () => {
  it('returns ok with null daysRemaining when no expiry', () => {
    expect(expiryStatus(null, NOW)).toEqual({ level: 'ok', daysRemaining: null });
    expect(expiryStatus(undefined, NOW)).toEqual({ level: 'ok', daysRemaining: null });
    expect(expiryStatus('not-a-date', NOW)).toEqual({ level: 'ok', daysRemaining: null });
  });

  it('marks past dates as expired', () => {
    expect(expiryStatus(at(-1), NOW).level).toBe('expired');
    expect(expiryStatus(at(-100), NOW).level).toBe('expired');
  });

  it('marks within 30 days as urgent', () => {
    expect(expiryStatus(at(0), NOW).level).toBe('urgent');
    expect(expiryStatus(at(15), NOW).level).toBe('urgent');
    expect(expiryStatus(at(30), NOW).level).toBe('urgent');
  });

  it('marks 31-180 days as warning', () => {
    expect(expiryStatus(at(31), NOW).level).toBe('warning');
    expect(expiryStatus(at(120), NOW).level).toBe('warning');
    expect(expiryStatus(at(180), NOW).level).toBe('warning');
  });

  it('marks > 180 days as ok', () => {
    expect(expiryStatus(at(181), NOW).level).toBe('ok');
    expect(expiryStatus(at(365), NOW).level).toBe('ok');
  });

  it('reports daysRemaining accurately', () => {
    expect(expiryStatus(at(7), NOW).daysRemaining).toBe(7);
    expect(expiryStatus(at(-3), NOW).daysRemaining).toBe(-3);
    expect(expiryStatus(at(0), NOW).daysRemaining).toBe(0);
  });
});

describe('expiryLabel', () => {
  it('returns null when no expiry', () => {
    expect(expiryLabel(expiryStatus(null, NOW))).toBeNull();
  });

  it('formats today as "Expires today"', () => {
    expect(expiryLabel(expiryStatus(at(0), NOW))).toBe('Expires today');
  });

  it('formats past dates as "Expired N days ago"', () => {
    expect(expiryLabel(expiryStatus(at(-1), NOW))).toBe('Expired 1 day ago');
    expect(expiryLabel(expiryStatus(at(-5), NOW))).toBe('Expired 5 days ago');
  });

  it('formats <=60 days as "Expires in N days"', () => {
    expect(expiryLabel(expiryStatus(at(1), NOW))).toBe('Expires in 1 day');
    expect(expiryLabel(expiryStatus(at(45), NOW))).toBe('Expires in 45 days');
  });

  it('formats >60 days as "Expires in N months"', () => {
    expect(expiryLabel(expiryStatus(at(90), NOW))).toBe('Expires in 3 months');
    expect(expiryLabel(expiryStatus(at(365), NOW))).toBe('Expires in 12 months');
  });
});
