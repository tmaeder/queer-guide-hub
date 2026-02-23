import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatEventTime, formatEventDateTime } from '../event-time';

describe('event-time', () => {
  // ── formatEventTime ──
  describe('formatEventTime', () => {
    // ─ All-day detection ─
    describe('all-day events', () => {
      it('classic midnight to 23:59 UTC → All Day', () => {
        expect(formatEventTime('2026-06-14T00:00:00Z', '2026-06-14T23:59:00Z')).toBe('All Day');
      });

      it('midnight to midnight (multi-day) → All Day', () => {
        expect(formatEventTime('2026-06-14T00:00:00Z', '2026-06-16T00:00:00Z')).toBe('All Day');
      });

      it('start midnight, no end → All Day', () => {
        expect(formatEventTime('2026-06-14T00:00:00Z')).toBe('All Day');
      });

      it('duration >= 23h50m → All Day', () => {
        expect(formatEventTime('2026-06-14T00:05:00Z', '2026-06-14T23:59:59Z')).toBe('All Day');
      });

      it('same-day wraparound (end <= start) → All Day', () => {
        expect(formatEventTime('2026-06-14T16:00:00Z', '2026-06-14T15:59:00Z')).toBe('All Day');
      });
    });

    // ─ Non-all-day: basic formatting without timezone ─
    describe('time-specific events without timezone', () => {
      it('formats start and end time', () => {
        const result = formatEventTime('2026-06-14T14:00:00Z', '2026-06-14T18:00:00Z');
        // Will be formatted in local timezone; just verify it's not All Day and has hyphen
        expect(result).not.toBe('All Day');
        expect(result).toContain(' - ');
      });

      it('formats start-only event', () => {
        const result = formatEventTime('2026-06-14T14:30:00Z');
        expect(result).not.toBe('All Day');
        expect(result).not.toContain(' - ');
      });
    });

    // ─ Timezone-aware formatting ─
    describe('with timezone', () => {
      it('formats in specified timezone', () => {
        // 14:00 UTC = 16:00 CEST (Europe/Zurich, summer)
        const result = formatEventTime(
          '2026-06-14T14:00:00Z',
          '2026-06-14T18:00:00Z',
          'Europe/Zurich',
        );
        expect(result).toContain('4:00 PM');
        expect(result).toContain('8:00 PM');
      });

      it('appends timezone abbreviation', () => {
        const result = formatEventTime(
          '2026-06-14T14:00:00Z',
          '2026-06-14T18:00:00Z',
          'Europe/Zurich',
        );
        // Should contain a timezone abbreviation (CEST or GMT+2)
        expect(result).toMatch(/[A-Z]{2,5}(\+\d)?$/);
      });

      it('handles start-only with timezone', () => {
        const result = formatEventTime(
          '2026-06-14T14:00:00Z',
          null,
          'America/New_York',
        );
        // 14:00 UTC = 10:00 AM EDT
        expect(result).toContain('10:00 AM');
      });

      it('still detects all-day even with timezone param', () => {
        expect(formatEventTime('2026-06-14T00:00:00Z', '2026-06-14T23:59:00Z', 'Europe/Zurich')).toBe('All Day');
      });
    });
  });

  // ── formatEventDateTime ──
  describe('formatEventDateTime', () => {
    describe('without timezone', () => {
      it('formats multi-day event as date range', () => {
        const result = formatEventDateTime('2026-06-14T10:00:00Z', '2026-06-16T18:00:00Z');
        expect(result).toContain('Jun 14, 2026');
        expect(result).toContain('Jun 16, 2026');
        expect(result).toContain(' - ');
      });

      it('formats all-day single-day event (UTC midnight pair)', () => {
        // midnight-to-23:59 UTC is all-day, but local browser timezone may shift the dates
        // so we only check the output is not empty and contains year
        const result = formatEventDateTime('2026-06-14T00:00:00Z', '2026-06-14T23:59:00Z');
        expect(result).toContain('2026');
        // In UTC-offset environments this may appear as multi-day range or All Day
        expect(result.length).toBeGreaterThan(5);
      });

      it('formats same-day event with times', () => {
        const result = formatEventDateTime('2026-06-14T14:00:00Z', '2026-06-14T18:00:00Z');
        expect(result).toContain('2026');
        expect(result).toContain('\u2022');
        expect(result).toContain(' - ');
      });

      it('formats start-only event', () => {
        const result = formatEventDateTime('2026-06-14T14:30:00Z');
        expect(result).toContain('2026');
        expect(result).toContain('\u2022');
      });
    });

    describe('with timezone', () => {
      it('formats multi-day event as date range in timezone', () => {
        const result = formatEventDateTime(
          '2026-06-14T22:00:00Z',
          '2026-06-16T04:00:00Z',
          'Europe/Zurich',
        );
        // 22:00 UTC = Jun 15 00:00 CEST; Jun 16 04:00 UTC = Jun 16 06:00 CEST
        // Dates differ in tz → should show date range
        expect(result).toContain(' - ');
      });

      it('formats same-day event with times in timezone', () => {
        const result = formatEventDateTime(
          '2026-06-14T14:00:00Z',
          '2026-06-14T18:00:00Z',
          'Europe/Zurich',
        );
        // Both are Jun 14 in Zurich → should show date • time - time
        expect(result).toContain('\u2022');
        expect(result).toContain('4:00 PM');
        expect(result).toContain('8:00 PM');
      });

      it('formats all-day event with timezone (UTC dates)', () => {
        // Use a timezone that keeps both dates on the same day: UTC itself
        const result = formatEventDateTime(
          '2026-06-14T00:00:00Z',
          '2026-06-14T23:59:00Z',
          'UTC',
        );
        // In UTC, start=Jun 14 00:00 and end=Jun 14 23:59 → same day → All Day
        expect(result).toContain('All Day');
        expect(result).toContain('Jun 14, 2026');
      });

      it('handles event crossing midnight in timezone', () => {
        // UTC Jun 14 23:00 → Jun 15 01:00 in Zurich (CEST = UTC+2)
        // UTC Jun 14 03:00 → Jun 14 05:00 in Zurich
        // So start=Jun 15 01:00, end=Jun 14 05:00? No, need to think clearly:
        // start: 2026-06-14T23:00:00Z → Zurich: Jun 15, 1:00 AM
        // end: 2026-06-15T03:00:00Z → Zurich: Jun 15, 5:00 AM
        // Same day in Zurich → should show time range
        const result = formatEventDateTime(
          '2026-06-14T23:00:00Z',
          '2026-06-15T03:00:00Z',
          'Europe/Zurich',
        );
        // Both dates are Jun 15 in Zurich → same day → should show times
        expect(result).toContain('1:00 AM');
        expect(result).toContain('5:00 AM');
      });
    });
  });
});
