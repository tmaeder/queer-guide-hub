import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  isValidIata,
  extractDDMM,
  isDateInPast,
  isReturnBeforeDepart,
  buildAviasalesUrl,
  getAffiliateUrl,
  AFFILIATE_MARKER,
} from '../aviasalesUrl';

// Freeze time so depart-date validation (isPastDate uses real `new Date()`)
// stays deterministic regardless of when the suite is run.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

describe('aviasalesUrl', () => {
  // ── isValidIata ──
  describe('isValidIata', () => {
    it('accepts valid 3-letter IATA codes', () => {
      expect(isValidIata('ZRH')).toBe(true);
      expect(isValidIata('LHR')).toBe(true);
      expect(isValidIata('JFK')).toBe(true);
      expect(isValidIata('BCN')).toBe(true);
    });

    it('accepts lowercase (normalized to uppercase)', () => {
      expect(isValidIata('zrh')).toBe(true);
      expect(isValidIata('lhr')).toBe(true);
    });

    it('rejects invalid codes', () => {
      expect(isValidIata('')).toBe(false);
      expect(isValidIata('AB')).toBe(false);      // too short
      expect(isValidIata('ABCD')).toBe(false);     // too long
      expect(isValidIata('12A')).toBe(false);       // contains digits
      expect(isValidIata('A-B')).toBe(false);       // contains hyphen
      expect(isValidIata(null)).toBe(false);
      expect(isValidIata(undefined)).toBe(false);
    });
  });

  // ── extractDDMM ──
  describe('extractDDMM', () => {
    it('extracts DDMM from YYYY-MM-DD', () => {
      expect(extractDDMM('2026-05-09')).toBe('0905');
      expect(extractDDMM('2026-12-25')).toBe('2512');
      expect(extractDDMM('2026-01-01')).toBe('0101');
    });

    it('extracts DDMM from ISO datetime', () => {
      expect(extractDDMM('2026-05-09T14:30:00Z')).toBe('0905');
      expect(extractDDMM('2026-03-11T00:00:00')).toBe('1103');
    });

    it('returns null for invalid dates', () => {
      expect(extractDDMM(null)).toBeNull();
      expect(extractDDMM(undefined)).toBeNull();
      expect(extractDDMM('')).toBeNull();
      expect(extractDDMM('invalid')).toBeNull();
      expect(extractDDMM('2026-13-01')).toBeNull();  // month 13
      expect(extractDDMM('2026-00-01')).toBeNull();   // month 0
      expect(extractDDMM('2026-05-32')).toBeNull();   // day 32
      expect(extractDDMM('2026-05-00')).toBeNull();   // day 0
    });
  });

  // ── isDateInPast ──
  describe('isDateInPast', () => {
    it('detects past dates', () => {
      expect(isDateInPast('2020-01-01')).toBe(true);
      expect(isDateInPast('2024-06-15')).toBe(true);
    });

    it('returns false for future dates', () => {
      expect(isDateInPast('2099-12-31')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isDateInPast(null)).toBe(false);
      expect(isDateInPast(undefined)).toBe(false);
    });
  });

  // ── isReturnBeforeDepart ──
  describe('isReturnBeforeDepart', () => {
    it('detects return before departure', () => {
      expect(isReturnBeforeDepart('2026-05-10', '2026-05-09')).toBe(true);
      expect(isReturnBeforeDepart('2026-06-01', '2026-05-31')).toBe(true);
    });

    it('allows return after departure', () => {
      expect(isReturnBeforeDepart('2026-05-09', '2026-05-10')).toBe(false);
      expect(isReturnBeforeDepart('2026-05-09', '2026-05-09')).toBe(false); // same day OK
    });

    it('returns false when either date is null', () => {
      expect(isReturnBeforeDepart(null, '2026-05-10')).toBe(false);
      expect(isReturnBeforeDepart('2026-05-10', null)).toBe(false);
      expect(isReturnBeforeDepart(null, null)).toBe(false);
    });
  });

  // ── buildAviasalesUrl ──
  describe('buildAviasalesUrl', () => {
    // Happy paths
    it('builds one-way URL with dates', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
        departDate: '2026-05-09',
      });
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRH0905BCN1&marker=452012');
      expect(result.error).toBeNull();
    });

    it('builds round-trip URL with departure and return dates', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
        departDate: '2026-05-09',
        returnDate: '2026-05-15',
      });
      expect(result.valid).toBe(true);
      // Format: ?params={ORIGIN}{DDMM_DEPART}{DEST}{DDMM_RETURN}{ADULTS}&marker=...
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRH0905BCN15051&marker=452012');
    });

    it('builds URL without dates', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
      });
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRHBCN1&marker=452012');
    });

    it('handles lowercase IATA codes', () => {
      const result = buildAviasalesUrl({
        origin: 'zrh',
        destination: 'bcn',
        departDate: '2026-05-09',
      });
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRH0905BCN1&marker=452012');
    });

    it('uses custom marker', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
        marker: '999999',
      });
      expect(result.valid).toBe(true);
      expect(result.url).toContain('marker=999999');
    });

    // Edge cases
    it('strips past departure dates (opens dateless search)', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
        departDate: '2020-01-01',
      });
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRHBCN1&marker=452012');
    });

    it('strips return date that is before departure', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
        departDate: '2026-05-15',
        returnDate: '2026-05-10', // Before departure
      });
      expect(result.valid).toBe(true);
      // Should have departure date but no return
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRH1505BCN1&marker=452012');
    });

    it('strips past return dates', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
        departDate: '2099-05-09',
        returnDate: '2020-01-01',
      });
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRH0905BCN1&marker=452012');
    });

    it('handles null dates', () => {
      const result = buildAviasalesUrl({
        origin: 'ZRH',
        destination: 'BCN',
        departDate: null,
        returnDate: null,
      });
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://www.aviasales.com/?params=ZRHBCN1&marker=452012');
    });

    it('clamps adults to 1-9', () => {
      const result0 = buildAviasalesUrl({ origin: 'ZRH', destination: 'BCN', adults: 0 });
      expect(result0.url).toContain('BCN1&'); // clamped to 1

      const result10 = buildAviasalesUrl({ origin: 'ZRH', destination: 'BCN', adults: 10 });
      expect(result10.url).toContain('BCN9&'); // clamped to 9

      const result3 = buildAviasalesUrl({ origin: 'ZRH', destination: 'BCN', adults: 3 });
      expect(result3.url).toContain('BCN3&');
    });

    // Validation errors
    it('rejects invalid origin IATA', () => {
      const result = buildAviasalesUrl({ origin: 'XX', destination: 'BCN' });
      expect(result.valid).toBe(false);
      expect(result.url).toBeNull();
      expect(result.error).toContain('Invalid origin');
    });

    it('rejects invalid destination IATA', () => {
      const result = buildAviasalesUrl({ origin: 'ZRH', destination: '12' });
      expect(result.valid).toBe(false);
      expect(result.url).toBeNull();
      expect(result.error).toContain('Invalid destination');
    });

    it('rejects same origin and destination', () => {
      const result = buildAviasalesUrl({ origin: 'ZRH', destination: 'ZRH' });
      expect(result.valid).toBe(false);
      expect(result.url).toBeNull();
      expect(result.error).toContain('same');
    });

    it('rejects empty origin', () => {
      const result = buildAviasalesUrl({ origin: '', destination: 'BCN' });
      expect(result.valid).toBe(false);
    });

    it('rejects empty destination', () => {
      const result = buildAviasalesUrl({ origin: 'ZRH', destination: '' });
      expect(result.valid).toBe(false);
    });

    // URL format validation
    it('URL always uses params query format', () => {
      const result = buildAviasalesUrl({ origin: 'ZRH', destination: 'BCN', departDate: '2026-05-09' });
      expect(result.url).toMatch(/^https:\/\/www\.aviasales\.com\/\?params=/);
    });

    it('URL never contains search.aviasales.com', () => {
      const result = buildAviasalesUrl({ origin: 'ZRH', destination: 'BCN', departDate: '2026-05-09' });
      expect(result.url).not.toContain('search.aviasales.com');
    });

    it('URL never contains aviasales.ru', () => {
      const result = buildAviasalesUrl({ origin: 'ZRH', destination: 'BCN', departDate: '2026-05-09' });
      expect(result.url).not.toContain('aviasales.ru');
    });

    it('URL always contains marker param', () => {
      const result = buildAviasalesUrl({ origin: 'ZRH', destination: 'BCN' });
      expect(result.url).toContain(`marker=${AFFILIATE_MARKER}`);
    });
  });

  // ── getAffiliateUrl ──
  describe('getAffiliateUrl', () => {
    it('returns valid URL for valid input', () => {
      const url = getAffiliateUrl({ origin: 'ZRH', destination: 'BCN', departDate: '2026-05-09' });
      expect(url).toBe('https://www.aviasales.com/?params=ZRH0905BCN1&marker=452012');
    });

    it('returns fallback for invalid params', () => {
      const url = getAffiliateUrl({ origin: '', destination: 'BCN' });
      expect(url).toBe(`https://www.aviasales.com/?marker=${AFFILIATE_MARKER}`);
    });

    it('returns fallback for same origin/destination', () => {
      const url = getAffiliateUrl({ origin: 'ZRH', destination: 'ZRH' });
      expect(url).toBe(`https://www.aviasales.com/?marker=${AFFILIATE_MARKER}`);
    });
  });

  // ── Real-world routes (manual verification set) ──
  describe('real-world routes', () => {
    const routes = [
      { origin: 'ZRH', dest: 'LON', date: '2027-03-11', expectedParams: 'ZRH1103LON1' },
      { origin: 'ZRH', dest: 'BCN', date: '2027-05-09', expectedParams: 'ZRH0905BCN1' },
      { origin: 'JFK', dest: 'LHR', date: '2027-07-04', expectedParams: 'JFK0407LHR1' },
      { origin: 'BER', dest: 'IST', date: '2027-12-25', expectedParams: 'BER2512IST1' },
      { origin: 'SFO', dest: 'NRT', date: '2027-08-15', expectedParams: 'SFO1508NRT1' },
    ];

    routes.forEach(({ origin, dest, date, expectedParams }) => {
      it(`${origin}→${dest} on ${date}`, () => {
        const result = buildAviasalesUrl({ origin, destination: dest, departDate: date });
        expect(result.valid).toBe(true);
        expect(result.url).toBe(`https://www.aviasales.com/?params=${expectedParams}&marker=452012`);
      });
    });
  });
});
