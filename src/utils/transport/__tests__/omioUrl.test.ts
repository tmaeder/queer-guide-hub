import { describe, it, expect } from 'vitest';
import { buildOmioUrl } from '../omioUrl';

function parseUrl(url: string) {
  const u = new URL(url);
  return { origin: u.origin, path: u.pathname, params: u.searchParams };
}

describe('buildOmioUrl', () => {
  describe('Base URL', () => {
    it('returns an omio.com search-frontend URL', () => {
      const { origin, path } = parseUrl(
        buildOmioUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(origin).toBe('https://www.omio.com');
      expect(path).toBe('/search-frontend/results');
    });
  });

  describe('Required params', () => {
    it('passes origin/destination via departureCity/arrivalCity', () => {
      const { params } = parseUrl(
        buildOmioUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(params.get('departureCity')).toBe('Berlin');
      expect(params.get('arrivalCity')).toBe('Paris');
    });
  });

  describe('Defaults', () => {
    it("defaults mode to 'all'", () => {
      const { params } = parseUrl(
        buildOmioUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(params.get('mode')).toBe('all');
    });

    it('defaults adults to 1', () => {
      const { params } = parseUrl(
        buildOmioUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(params.get('adults')).toBe('1');
    });
  });

  describe('Mode selection', () => {
    it.each(['trains', 'buses', 'flights', 'all'] as const)(
      'forwards mode=%s through unchanged',
      mode => {
        const { params } = parseUrl(
          buildOmioUrl({ origin: 'A', destination: 'B', mode }),
        );
        expect(params.get('mode')).toBe(mode);
      },
    );
  });

  describe('Date params', () => {
    it('passes ISO dates through unchanged', () => {
      const { params } = parseUrl(
        buildOmioUrl({
          origin: 'A',
          destination: 'B',
          departDate: '2026-04-20',
          returnDate: '2026-04-25',
        }),
      );
      expect(params.get('departureDate')).toBe('2026-04-20');
      expect(params.get('returnDate')).toBe('2026-04-25');
    });

    it('omits dates when null/undefined', () => {
      const { params } = parseUrl(
        buildOmioUrl({ origin: 'A', destination: 'B', departDate: null }),
      );
      expect(params.has('departureDate')).toBe(false);
      expect(params.has('returnDate')).toBe(false);
    });
  });

  describe('Adults clamping', () => {
    it('clamps below 1 to 1', () => {
      const { params } = parseUrl(
        buildOmioUrl({ origin: 'A', destination: 'B', adults: 0 }),
      );
      expect(params.get('adults')).toBe('1');
    });

    it('clamps above 9 to 9', () => {
      const { params } = parseUrl(
        buildOmioUrl({ origin: 'A', destination: 'B', adults: 50 }),
      );
      expect(params.get('adults')).toBe('9');
    });
  });

  describe('Affiliate ID', () => {
    it('omits partner_id when VITE_OMIO_PARTNER_ID is empty', () => {
      const { params } = parseUrl(
        buildOmioUrl({ origin: 'A', destination: 'B' }),
      );
      expect(params.has('partner_id')).toBe(false);
    });
  });
});
