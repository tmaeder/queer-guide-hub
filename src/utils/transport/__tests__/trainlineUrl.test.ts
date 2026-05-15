import { describe, it, expect } from 'vitest';
import { buildTrainlineUrl } from '../trainlineUrl';

function parseUrl(url: string) {
  const u = new URL(url);
  return { origin: u.origin, path: u.pathname, params: u.searchParams };
}

describe('buildTrainlineUrl', () => {
  describe('Base URL', () => {
    it('returns a thetrainline.com book/results URL', () => {
      const { origin, path } = parseUrl(
        buildTrainlineUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(origin).toBe('https://www.thetrainline.com');
      expect(path).toBe('/book/results');
    });
  });

  describe('Required params', () => {
    it('passes origin and destination directly', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({ origin: 'Berlin', destination: 'Paris' }),
      );
      expect(params.get('origin')).toBe('Berlin');
      expect(params.get('destination')).toBe('Paris');
    });
  });

  describe('Defaults', () => {
    it('defaults passengers to 1', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({ origin: 'A', destination: 'B' }),
      );
      expect(params.get('passengers')).toBe('1');
    });

    it("defaults journeySearchType to 'single' when no return date", () => {
      const { params } = parseUrl(
        buildTrainlineUrl({ origin: 'A', destination: 'B' }),
      );
      expect(params.get('journeySearchType')).toBe('single');
    });
  });

  describe('Return trips', () => {
    it("sets journeySearchType to 'return' when returnDate provided", () => {
      const { params } = parseUrl(
        buildTrainlineUrl({
          origin: 'A',
          destination: 'B',
          returnDate: '2026-04-25',
        }),
      );
      expect(params.get('journeySearchType')).toBe('return');
    });

    it('appends T18:00:00 to return date', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({
          origin: 'A',
          destination: 'B',
          returnDate: '2026-04-25',
        }),
      );
      expect(params.get('inwardDate')).toBe('2026-04-25T18:00:00');
    });
  });

  describe('Outward date', () => {
    it('appends T08:00:00 to depart date', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({
          origin: 'A',
          destination: 'B',
          departDate: '2026-04-20',
        }),
      );
      expect(params.get('outwardDate')).toBe('2026-04-20T08:00:00');
    });

    it('omits outwardDate when departDate is null', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({ origin: 'A', destination: 'B', departDate: null }),
      );
      expect(params.has('outwardDate')).toBe(false);
    });
  });

  describe('Adults clamping', () => {
    it('clamps below 1 to 1', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({ origin: 'A', destination: 'B', adults: 0 }),
      );
      expect(params.get('passengers')).toBe('1');
    });

    it('clamps above 9 to 9', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({ origin: 'A', destination: 'B', adults: 50 }),
      );
      expect(params.get('passengers')).toBe('9');
    });
  });

  describe('Affiliate ID', () => {
    it('omits clickref when VITE_TRAINLINE_PARTNER_ID is empty', () => {
      const { params } = parseUrl(
        buildTrainlineUrl({ origin: 'A', destination: 'B' }),
      );
      expect(params.has('clickref')).toBe(false);
    });
  });
});
