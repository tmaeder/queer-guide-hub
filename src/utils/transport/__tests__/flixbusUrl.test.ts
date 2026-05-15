import { describe, it, expect } from 'vitest';
import { buildFlixbusUrl } from '../flixbusUrl';

function parseUrl(url: string) {
  const u = new URL(url);
  return { origin: u.origin, path: u.pathname, params: u.searchParams };
}

describe('buildFlixbusUrl', () => {
  describe('Base URL', () => {
    it('returns a global.flixbus.com search URL', () => {
      const { origin, path } = parseUrl(
        buildFlixbusUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(origin).toBe('https://global.flixbus.com');
      expect(path).toBe('/search');
    });
  });

  describe('Required params', () => {
    it('passes origin via departureCity and destination via arrivalCity', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(params.get('departureCity')).toBe('Berlin');
      expect(params.get('arrivalCity')).toBe('Paris');
    });
  });

  describe('Defaults', () => {
    it('defaults adult count to 1', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(params.get('adult')).toBe('1');
    });
  });

  describe('Date conversion (ISO → DD.MM.YYYY)', () => {
    it('converts ISO depart date to DD.MM.YYYY', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({
          origin: 'Berlin',
          destination: 'Paris',
          departDate: '2026-04-20',
        }),
      );
      expect(params.get('rideDate')).toBe('20.04.2026');
    });

    it('converts ISO return date to DD.MM.YYYY', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({
          origin: 'Berlin',
          destination: 'Paris',
          returnDate: '2026-05-01',
        }),
      );
      expect(params.get('returnRideDate')).toBe('01.05.2026');
    });

    it('strips time portion before converting', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({
          origin: 'Berlin',
          destination: 'Paris',
          departDate: '2026-04-20T15:30:00Z',
        }),
      );
      expect(params.get('rideDate')).toBe('20.04.2026');
    });

    it('omits rideDate when departDate is null', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({ origin: 'Berlin', destination: 'Paris', departDate: null }),
      );
      expect(params.has('rideDate')).toBe(false);
    });

    it('omits rideDate when ISO string has no dashes', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({
          origin: 'Berlin',
          destination: 'Paris',
          departDate: 'notadate',
        }),
      );
      expect(params.has('rideDate')).toBe(false);
    });
  });

  describe('Adults clamping', () => {
    it('clamps below 1 to 1', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({ origin: 'A', destination: 'B', adults: 0 }),
      );
      expect(params.get('adult')).toBe('1');
    });

    it('clamps above 9 to 9', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({ origin: 'A', destination: 'B', adults: 20 }),
      );
      expect(params.get('adult')).toBe('9');
    });

    it('rounds non-integer adults', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({ origin: 'A', destination: 'B', adults: 1.6 }),
      );
      expect(params.get('adult')).toBe('2');
    });
  });

  describe('Affiliate ID', () => {
    it('omits awc when VITE_FLIXBUS_AWIN_ID is empty', () => {
      const { params } = parseUrl(
        buildFlixbusUrl({ origin: 'A', destination: 'B' }),
      );
      expect(params.has('awc')).toBe(false);
    });
  });
});
