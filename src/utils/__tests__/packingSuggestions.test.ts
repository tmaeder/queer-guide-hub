import { describe, it, expect } from 'vitest';
import {
  hemisphereFor,
  seasonFor,
  durationDays,
  generatePackingSuggestions,
} from '../packingSuggestions';

describe('packingSuggestions', () => {
  describe('hemisphereFor', () => {
    it('defaults to north for null', () => {
      expect(hemisphereFor(null)).toBe('north');
    });
    it('detects southern hemisphere', () => {
      expect(hemisphereFor('AR')).toBe('south');
      expect(hemisphereFor('ZA')).toBe('south');
      expect(hemisphereFor('AU')).toBe('south');
    });
    it('detects equatorial', () => {
      expect(hemisphereFor('KE')).toBe('equatorial');
      expect(hemisphereFor('BR')).toBe('equatorial');
    });
    it('defaults unknown to north', () => {
      expect(hemisphereFor('US')).toBe('north');
      expect(hemisphereFor('DE')).toBe('north');
    });
  });

  describe('seasonFor', () => {
    it('returns summer by default when no date', () => {
      expect(seasonFor(null, 'north')).toBe('summer');
    });
    it('north July = summer', () => {
      expect(seasonFor('2026-07-15', 'north')).toBe('summer');
    });
    it('north January = winter', () => {
      expect(seasonFor('2026-01-10', 'north')).toBe('winter');
    });
    it('south July = winter (inverted)', () => {
      expect(seasonFor('2026-07-15', 'south')).toBe('winter');
    });
    it('south January = summer', () => {
      expect(seasonFor('2026-01-10', 'south')).toBe('summer');
    });
    it('equatorial July = rainy', () => {
      expect(seasonFor('2026-07-15', 'equatorial')).toBe('rainy');
    });
    it('equatorial February = dry', () => {
      expect(seasonFor('2026-02-10', 'equatorial')).toBe('dry');
    });
  });

  describe('durationDays', () => {
    it('defaults to 3 when dates missing', () => {
      expect(durationDays(null, null)).toBe(3);
      expect(durationDays('2026-01-01', null)).toBe(3);
    });
    it('computes inclusive day count', () => {
      expect(durationDays('2026-01-01', '2026-01-07')).toBe(7);
      expect(durationDays('2026-06-01', '2026-06-01')).toBe(1);
    });
    it('handles invalid dates safely', () => {
      expect(durationDays('nonsense', 'nope')).toBe(3);
    });
  });

  describe('generatePackingSuggestions', () => {
    it('caps results at 15', () => {
      const out = generatePackingSuggestions({
        countryCode: 'DE',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
        activities: ['beach', 'hiking', 'nightlife', 'business'],
        equalityScore: 2,
      });
      expect(out.length).toBeLessThanOrEqual(15);
    });

    it('suggests thermal baselayer for cold winter trip', () => {
      const out = generatePackingSuggestions({
        countryCode: 'SE',
        startDate: '2026-01-15',
        endDate: '2026-01-22',
      });
      expect(out.some((q) => q.query.includes('thermal'))).toBe(true);
      expect(out.some((q) => q.query.includes('down jacket'))).toBe(true);
    });

    it('suggests sun hat + linen shirt for hot summer trip', () => {
      const out = generatePackingSuggestions({
        countryCode: 'ES',
        startDate: '2026-07-15',
        endDate: '2026-07-22',
      });
      expect(out.some((q) => q.query.includes('linen'))).toBe(true);
      expect(out.some((q) => q.query.includes('sun hat'))).toBe(true);
    });

    it('adds beach items when beach activity present', () => {
      const out = generatePackingSuggestions({
        countryCode: 'ES',
        startDate: '2026-07-15',
        endDate: '2026-07-22',
        activities: ['beach'],
      });
      expect(out.some((q) => q.query.includes('towel'))).toBe(true);
      expect(out.some((q) => q.query.includes('sunscreen'))).toBe(true);
    });

    it('adds hiking items when hiking activity present', () => {
      const out = generatePackingSuggestions({
        countryCode: 'CH',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
        activities: ['hiking'],
      });
      expect(out.some((q) => q.query.includes('hiking boots'))).toBe(true);
    });

    it('adds safety wallet for low equality score destinations', () => {
      const out = generatePackingSuggestions({
        countryCode: 'EG',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
        equalityScore: 2,
      });
      expect(out.some((q) => q.category === 'safety')).toBe(true);
    });

    it('skips safety wallet for high equality score', () => {
      const out = generatePackingSuggestions({
        countryCode: 'DE',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
        equalityScore: 9,
      });
      expect(out.some((q) => q.category === 'safety')).toBe(false);
    });

    it('adds power bank only for trips ≥ 4 days', () => {
      const short = generatePackingSuggestions({
        countryCode: 'DE',
        startDate: '2026-06-15',
        endDate: '2026-06-16',
      });
      const long = generatePackingSuggestions({
        countryCode: 'DE',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
      });
      expect(short.some((q) => q.query.includes('power bank'))).toBe(false);
      expect(long.some((q) => q.query.includes('power bank'))).toBe(true);
    });

    it('picks correct power adapter per country group', () => {
      const us = generatePackingSuggestions({
        countryCode: 'US',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
      });
      const uk = generatePackingSuggestions({
        countryCode: 'GB',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
      });
      const au = generatePackingSuggestions({
        countryCode: 'AU',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
      });
      const de = generatePackingSuggestions({
        countryCode: 'DE',
        startDate: '2026-06-15',
        endDate: '2026-06-22',
      });
      expect(us.some((q) => q.query.includes('type A'))).toBe(true);
      expect(uk.some((q) => q.query.includes('type G'))).toBe(true);
      expect(au.some((q) => q.query.includes('type I'))).toBe(true);
      expect(de.some((q) => q.query.includes('type C'))).toBe(true);
    });

    it('handles missing dates (defaults season to summer)', () => {
      const out = generatePackingSuggestions({
        countryCode: null,
        startDate: null,
        endDate: null,
      });
      expect(out.length).toBeGreaterThan(0);
      expect(out.some((q) => q.category === 'electronics')).toBe(true);
    });

    // ── Empty-trip / null-safety regression suite ───────────────────
    describe('empty / null-safety regressions', () => {
      it('does not throw when every input is null/undefined (fresh trip)', () => {
        expect(() =>
          generatePackingSuggestions({
            countryCode: null,
            startDate: null,
            endDate: null,
          }),
        ).not.toThrow();
      });

      it('returns universal adapter when no country (no places)', () => {
        const out = generatePackingSuggestions({
          countryCode: null,
          startDate: null,
          endDate: null,
        });
        expect(out.some((q) => q.query === 'universal travel adapter')).toBe(
          true,
        );
      });

      it('returns a sensible baseline without climate data', () => {
        const out = generatePackingSuggestions({
          countryCode: 'DE',
          startDate: '2026-07-01',
          endDate: '2026-07-05',
          // climate omitted
        });
        expect(out.some((q) => q.category === 'clothing')).toBe(true);
        expect(out.some((q) => q.category === 'toiletries')).toBe(true);
      });

      it('handles an empty activities array without adding activity items', () => {
        const out = generatePackingSuggestions({
          countryCode: 'DE',
          startDate: '2026-07-01',
          endDate: '2026-07-05',
          activities: [],
        });
        expect(out.some((q) => q.query.includes('hiking boots'))).toBe(false);
        expect(out.some((q) => q.query.includes('sunscreen'))).toBe(false);
      });

      it('short trip (1 day) skips power bank but still returns essentials', () => {
        const out = generatePackingSuggestions({
          countryCode: 'DE',
          startDate: '2026-06-15',
          endDate: '2026-06-15',
        });
        expect(out.some((q) => q.query.includes('power bank'))).toBe(false);
        expect(out.some((q) => q.category === 'toiletries')).toBe(true);
        expect(out.some((q) => q.category === 'electronics')).toBe(true);
      });

      it('arctic / polar climate forces cold-weather gear even in summer month', () => {
        const out = generatePackingSuggestions({
          countryCode: 'IS',
          climate: 'polar',
          startDate: '2026-07-15',
          endDate: '2026-07-22',
        });
        expect(out.some((q) => q.query.includes('thermal'))).toBe(true);
        expect(out.some((q) => q.query.includes('down jacket'))).toBe(true);
        expect(out.some((q) => q.query.includes('beanie'))).toBe(true);
      });

      it('desert / arid hot trip keeps sun protection', () => {
        const out = generatePackingSuggestions({
          countryCode: 'AE',
          climate: 'arid',
          startDate: '2026-07-15',
          endDate: '2026-07-22',
        });
        expect(out.some((q) => q.query.includes('linen'))).toBe(true);
        expect(out.some((q) => q.query.includes('sun hat'))).toBe(true);
      });

      it('equatorial rainy season suggests a rain jacket', () => {
        const out = generatePackingSuggestions({
          countryCode: 'KE',
          startDate: '2026-07-15',
          endDate: '2026-07-22',
        });
        expect(out.some((q) => q.query.includes('rain jacket'))).toBe(true);
      });

      it('returns at least the baseline set (non-empty) for a fresh trip', () => {
        const out = generatePackingSuggestions({
          countryCode: null,
          startDate: null,
          endDate: null,
        });
        // baseline: one clothing, one adapter, one toiletries bag at minimum
        expect(out.length).toBeGreaterThanOrEqual(3);
      });
    });
  });
});
