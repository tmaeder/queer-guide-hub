import { describe, it, expect } from 'vitest';
import {
  formatTimeInZone,
  formatDateInZone,
  getTimezoneAbbr,
  getTimezoneOffset,
  isValidTimezone,
} from '../timezone';

describe('timezone utilities', () => {
  // ── formatTimeInZone ──
  describe('formatTimeInZone', () => {
    it('formats UTC noon in Europe/Zurich during summer (CEST = UTC+2)', () => {
      // June 14 12:00 UTC → 14:00 CEST → 2:00 PM
      const result = formatTimeInZone('2026-06-14T12:00:00Z', 'Europe/Zurich');
      expect(result).toBe('2:00 PM');
    });

    it('formats UTC noon in Europe/Zurich during winter (CET = UTC+1)', () => {
      // January 14 12:00 UTC → 13:00 CET → 1:00 PM
      const result = formatTimeInZone('2026-01-14T12:00:00Z', 'Europe/Zurich');
      expect(result).toBe('1:00 PM');
    });

    it('formats in America/New_York during summer (EDT = UTC-4)', () => {
      // June 14 12:00 UTC → 08:00 EDT → 8:00 AM
      const result = formatTimeInZone('2026-06-14T12:00:00Z', 'America/New_York');
      expect(result).toBe('8:00 AM');
    });

    it('formats in America/New_York during winter (EST = UTC-5)', () => {
      // January 14 12:00 UTC → 07:00 EST → 7:00 AM
      const result = formatTimeInZone('2026-01-14T12:00:00Z', 'America/New_York');
      expect(result).toBe('7:00 AM');
    });

    it('handles event near midnight crossing day boundary', () => {
      // June 14 23:30 UTC → June 15 01:30 CEST
      const result = formatTimeInZone('2026-06-14T23:30:00Z', 'Europe/Zurich');
      expect(result).toBe('1:30 AM');
    });

    it('falls back to browser default for null timezone', () => {
      const result = formatTimeInZone('2026-06-14T12:00:00Z', null);
      // Should not throw, returns some time string
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('falls back to browser default for invalid timezone', () => {
      const result = formatTimeInZone('2026-06-14T12:00:00Z', 'Invalid/Timezone');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  // ── formatDateInZone ──
  describe('formatDateInZone', () => {
    it('formats date in UTC timezone', () => {
      const result = formatDateInZone('2026-06-14T12:00:00Z', 'UTC');
      expect(result).toBe('Jun 14, 2026');
    });

    it('handles date shift across day boundary in timezone', () => {
      // June 14 23:30 UTC → June 15 in Zurich (CEST)
      const result = formatDateInZone('2026-06-14T23:30:00Z', 'Europe/Zurich');
      expect(result).toBe('Jun 15, 2026');
    });

    it('handles date in Asia/Tokyo (UTC+9)', () => {
      // June 14 20:00 UTC → June 15 05:00 JST
      const result = formatDateInZone('2026-06-14T20:00:00Z', 'Asia/Tokyo');
      expect(result).toBe('Jun 15, 2026');
    });

    it('falls back for null timezone', () => {
      const result = formatDateInZone('2026-06-14T12:00:00Z', null);
      expect(result).toBeTruthy();
    });
  });

  // ── getTimezoneAbbr ──
  describe('getTimezoneAbbr', () => {
    it('returns abbreviation for valid timezone', () => {
      const abbr = getTimezoneAbbr('America/New_York');
      // Should be EDT or EST depending on current date
      expect(abbr).toBeTruthy();
      expect(typeof abbr).toBe('string');
    });

    it('returns abbreviation for UTC', () => {
      const abbr = getTimezoneAbbr('UTC');
      expect(abbr).toBe('UTC');
    });

    it('returns null for null input', () => {
      expect(getTimezoneAbbr(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(getTimezoneAbbr(undefined)).toBeNull();
    });

    it('returns null for invalid timezone', () => {
      expect(getTimezoneAbbr('Not/A/Timezone')).toBeNull();
    });
  });

  // ── getTimezoneOffset ──
  describe('getTimezoneOffset', () => {
    it('returns UTC+0 for UTC', () => {
      const offset = getTimezoneOffset('UTC');
      expect(offset).toBe('UTC+0');
    });

    it('returns offset for Asia/Tokyo (always UTC+9)', () => {
      const offset = getTimezoneOffset('Asia/Tokyo');
      expect(offset).toBe('UTC+9');
    });

    it('returns null for null input', () => {
      expect(getTimezoneOffset(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(getTimezoneOffset(undefined)).toBeNull();
    });

    it('returns null for invalid timezone', () => {
      expect(getTimezoneOffset('Fake/Zone')).toBeNull();
    });
  });

  // ── isValidTimezone ──
  describe('isValidTimezone', () => {
    it('accepts valid IANA timezones', () => {
      expect(isValidTimezone('Europe/Zurich')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Pacific/Auckland')).toBe(true);
    });

    it('rejects invalid timezone strings', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('NotATimezone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });
});
