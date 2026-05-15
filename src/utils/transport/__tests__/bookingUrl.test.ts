import { describe, it, expect } from 'vitest';
import { buildBookingUrl } from '../bookingUrl';

function parseUrl(url: string) {
  const u = new URL(url);
  return { origin: u.origin, path: u.pathname, params: u.searchParams };
}

describe('buildBookingUrl', () => {
  describe('Required params', () => {
    it('returns a booking.com searchresults URL', () => {
      const url = buildBookingUrl({ destination: 'Berlin' });
      const { origin, path } = parseUrl(url);
      expect(origin).toBe('https://www.booking.com');
      expect(path).toBe('/searchresults.html');
    });

    it('passes destination via ss query param', () => {
      const url = buildBookingUrl({ destination: 'Berlin' });
      expect(parseUrl(url).params.get('ss')).toBe('Berlin');
    });
  });

  describe('Defaults', () => {
    it('defaults adults to 2 and rooms to 1', () => {
      const { params } = parseUrl(buildBookingUrl({ destination: 'Berlin' }));
      expect(params.get('group_adults')).toBe('2');
      expect(params.get('no_rooms')).toBe('1');
    });
  });

  describe('Date params', () => {
    it('omits checkin/checkout when not provided', () => {
      const { params } = parseUrl(buildBookingUrl({ destination: 'Berlin' }));
      expect(params.has('checkin')).toBe(false);
      expect(params.has('checkout')).toBe(false);
    });

    it('passes ISO dates through unchanged', () => {
      const { params } = parseUrl(
        buildBookingUrl({
          destination: 'Berlin',
          checkIn: '2026-06-01',
          checkOut: '2026-06-05',
        }),
      );
      expect(params.get('checkin')).toBe('2026-06-01');
      expect(params.get('checkout')).toBe('2026-06-05');
    });

    it('ignores null check-in', () => {
      const { params } = parseUrl(
        buildBookingUrl({ destination: 'Berlin', checkIn: null }),
      );
      expect(params.has('checkin')).toBe(false);
    });
  });

  describe('Adults clamping', () => {
    it('clamps below 1 to 1', () => {
      const { params } = parseUrl(
        buildBookingUrl({ destination: 'Berlin', adults: 0 }),
      );
      expect(params.get('group_adults')).toBe('1');
    });

    it('clamps above 30 to 30', () => {
      const { params } = parseUrl(
        buildBookingUrl({ destination: 'Berlin', adults: 100 }),
      );
      expect(params.get('group_adults')).toBe('30');
    });

    it('rounds non-integer values', () => {
      const { params } = parseUrl(
        buildBookingUrl({ destination: 'Berlin', adults: 2.7 }),
      );
      expect(params.get('group_adults')).toBe('3');
    });
  });

  describe('Rooms clamping', () => {
    it('clamps below 1 to 1', () => {
      const { params } = parseUrl(
        buildBookingUrl({ destination: 'Berlin', rooms: 0 }),
      );
      expect(params.get('no_rooms')).toBe('1');
    });

    it('clamps above 10 to 10', () => {
      const { params } = parseUrl(
        buildBookingUrl({ destination: 'Berlin', rooms: 50 }),
      );
      expect(params.get('no_rooms')).toBe('10');
    });
  });

  describe('Affiliate ID', () => {
    it('omits aid param when VITE_BOOKING_AID is empty', () => {
      // Module reads env at import time — without VITE_BOOKING_AID set in
      // test env, aid should not appear.
      const { params } = parseUrl(buildBookingUrl({ destination: 'Berlin' }));
      expect(params.has('aid')).toBe(false);
    });
  });
});
