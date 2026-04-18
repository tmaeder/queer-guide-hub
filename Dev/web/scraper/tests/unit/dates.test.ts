import { describe, it, expect } from 'vitest';
import { parseDate, parseDateRange, inferTimezone } from '../../src/utils/dates.js';

describe('parseDate', () => {
  it('parses ISO 8601 dates', () => {
    const d = parseDate('2026-03-15T14:00:00Z');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(2); // March = 2
    expect(d!.getUTCDate()).toBe(15);
  });

  it('parses ISO date only', () => {
    const d = parseDate('2026-03-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it('parses US format dates', () => {
    const d = parseDate('March 15, 2026');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(15);
  });

  it('parses European format dates', () => {
    const d = parseDate('15 March 2026');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it('returns null for null/undefined/empty input', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDate('not a date at all')).toBeNull();
  });
});

describe('parseDateRange', () => {
  it('parses "Month Day-Day, Year" format', () => {
    const { start, end } = parseDateRange('March 15-17, 2026');
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();
    expect(start!.getDate()).toBe(15);
    expect(end!.getDate()).toBe(17);
  });

  it('parses single date as start with null end', () => {
    const { start, end } = parseDateRange('2026-03-15');
    expect(start).not.toBeNull();
    expect(end).toBeNull();
  });
});

describe('inferTimezone', () => {
  it('returns correct timezone for known cities', () => {
    expect(inferTimezone('London', 'United Kingdom')).toBe('Europe/London');
    expect(inferTimezone('Berlin', 'Germany')).toBe('Europe/Berlin');
    expect(inferTimezone('New York', 'United States')).toBe('America/New_York');
  });

  it('returns UTC for unknown locations', () => {
    expect(inferTimezone('Unknown City', 'Unknown Country')).toBe('UTC');
  });

  it('handles null/undefined', () => {
    expect(inferTimezone(null, null)).toBe('UTC');
  });
});
