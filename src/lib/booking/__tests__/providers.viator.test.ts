import { describe, it, expect } from 'vitest';
import { viatorProvider } from '../providers/viator';

describe('viatorProvider', () => {
  describe('Identity', () => {
    it('declares its name, vertical, and in-app support', () => {
      expect(viatorProvider.name).toBe('viator');
      expect(viatorProvider.vertical).toBe('activity');
      expect(viatorProvider.supportsInApp).toBe(false);
    });
  });

  describe('search', () => {
    it('returns empty array when cityName is missing', async () => {
      const r = await viatorProvider.search({ vertical: 'activity' });
      expect(r).toEqual([]);
    });

    it('returns up to limit results (default 6)', async () => {
      const r = await viatorProvider.search({ vertical: 'activity', cityName: 'Berlin' });
      expect(r).toHaveLength(6);
    });

    it('honors limit param', async () => {
      const r = await viatorProvider.search({ vertical: 'activity', cityName: 'Berlin', limit: 2 });
      expect(r).toHaveLength(2);
    });

    it('builds slugged Viator URL with affiliate params', async () => {
      const r = await viatorProvider.search({ vertical: 'activity', cityName: 'New York' });
      const url = new URL(r[0].bookingUrl!);
      expect(url.host).toBe('www.viator.com');
      expect(url.pathname.startsWith('/new-york/d')).toBe(true);
      expect(url.searchParams.get('pid')).toBe('P00089289');
      expect(url.searchParams.get('mcid')).toBe('42383');
      expect(url.searchParams.get('medium')).toBe('link');
    });

    it('appends startDate query when checkIn is provided', async () => {
      const r = await viatorProvider.search({
        vertical: 'activity',
        cityName: 'Berlin',
        checkIn: '2026-06-01',
        limit: 1,
      });
      const url = new URL(r[0].bookingUrl!);
      expect(url.searchParams.get('startDate')).toBe('2026-06-01');
    });

    it('returns activity-typed results with provider=viator', async () => {
      const r = await viatorProvider.search({ vertical: 'activity', cityName: 'Paris', limit: 1 });
      expect(r[0]).toMatchObject({
        provider: 'viator',
        vertical: 'activity',
        price: 0,
        currency: 'EUR',
        supportsInApp: false,
      });
      expect(r[0].title).toContain('Paris');
    });
  });

  describe('getBookingUrl', () => {
    it('returns the result bookingUrl when present', () => {
      const url = viatorProvider.getBookingUrl!({
        id: 'x',
        provider: 'viator',
        vertical: 'activity',
        title: 'x',
        price: 0,
        currency: 'EUR',
        bookingUrl: 'https://viator.com/foo',
        supportsInApp: false,
      });
      expect(url).toBe('https://viator.com/foo');
    });

    it('falls back to canonical affiliate URL when bookingUrl missing', () => {
      const url = viatorProvider.getBookingUrl!({
        id: 'x',
        provider: 'viator',
        vertical: 'activity',
        title: 'x',
        price: 0,
        currency: 'EUR',
        supportsInApp: false,
      });
      expect(url).toBe('https://www.viator.com/?pid=P00089289&mcid=42383&medium=link');
    });
  });
});
