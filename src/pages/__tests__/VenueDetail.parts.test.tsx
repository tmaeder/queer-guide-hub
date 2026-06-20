/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

import {
  getPriceRange,
  formatHours,
  hasUsableHours,
  buildVenueBreadcrumbs,
} from '../VenueDetail.parts';
import type { VenueWithRelations } from '../VenueDetail.parts';

const render = (node: unknown) => renderToStaticMarkup(node as ReactElement);

describe('VenueDetail.parts', () => {
  it('getPriceRange handles null', () => {
    expect(getPriceRange(null)).toBeDefined();
  });
  it('getPriceRange handles number', () => {
    expect(getPriceRange(2)).toBe('$$');
  });

  describe('hasUsableHours', () => {
    it('returns false for null / non-object / empty', () => {
      expect(hasUsableHours(null)).toBe(false);
      expect(hasUsableHours(undefined)).toBe(false);
      expect(hasUsableHours('not-an-object')).toBe(false);
      expect(hasUsableHours({})).toBe(false);
    });
    it('returns false when every day is empty / "Closed"', () => {
      expect(
        hasUsableHours({ monday: '', tuesday: 'Closed', wednesday: '   ', thursday: 'closed' }),
      ).toBe(false);
    });
    it('returns true when at least one day has a string value', () => {
      expect(hasUsableHours({ monday: '9am-5pm' })).toBe(true);
    });
    it('returns true when at least one day has open + close', () => {
      expect(hasUsableHours({ tuesday: { open: '0900', close: '1700' } })).toBe(true);
    });
  });

  describe('buildVenueBreadcrumbs (D5)', () => {
    const baseVenue = { id: 'v1', name: 'Test Venue' } as VenueWithRelations;
    const t = ((_k: string, d: string) => d) as never;

    it('returns undefined for null venue', () => {
      expect(buildVenueBreadcrumbs(null, t)).toBeUndefined();
    });
    it('omits country segment when countries FK is null', () => {
      const trail = buildVenueBreadcrumbs({
        ...baseVenue,
        countries: null,
        country: 'CH',
        cities: null,
        city: 'Zürich',
      } as VenueWithRelations, t);
      expect(trail).toEqual([
        { label: 'Venues', href: '/venues' },
        { label: 'Test Venue' },
      ]);
      // The ISO code from the raw text column must NOT leak through.
      expect(JSON.stringify(trail)).not.toContain('"CH"');
      expect(JSON.stringify(trail)).not.toContain('Zürich');
    });
    it('renders joined country + city when FKs are present', () => {
      const trail = buildVenueBreadcrumbs({
        ...baseVenue,
        countries: { id: 'c1', slug: 'switzerland', name: 'Switzerland' },
        cities: { id: 'ci1', slug: 'zurich', name: 'Zürich' },
      } as VenueWithRelations, t);
      expect(trail).toEqual([
        { label: 'Venues', href: '/venues' },
        { label: 'Switzerland', href: '/country/switzerland' },
        { label: 'Zürich', href: '/city/zurich' },
        { label: 'Test Venue' },
      ]);
    });
    it('renders country only when city FK is null', () => {
      const trail = buildVenueBreadcrumbs({
        ...baseVenue,
        countries: { id: 'c1', slug: 'germany', name: 'Germany' },
        cities: null,
      } as VenueWithRelations, t);
      expect(trail).toEqual([
        { label: 'Venues', href: '/venues' },
        { label: 'Germany', href: '/country/germany' },
        { label: 'Test Venue' },
      ]);
    });
  });

  describe('formatHours', () => {
    it('renders "Hours not available" for empty input', () => {
      const html = render(formatHours({}));
      expect(html).toContain('Hours not available');
    });
    it('renders the "Hours not available" branch when every day is closed', () => {
      const html = render(
        formatHours({
          monday: 'Closed',
          tuesday: '',
          wednesday: null as unknown as string,
        }),
      );
      expect(html).toContain('Hours not available');
      expect(html).not.toContain('Mon');
    });
    it('formats object-shape hours as HH:MM–HH:MM', () => {
      const html = render(
        formatHours({
          monday: { open: '0900', close: '1700' },
        }),
      );
      expect(html).toContain('09:00–17:00');
      expect(html).toContain('Mon');
      // Missing days render as Closed
      expect(html).toContain('Closed');
    });
    it('renders string-shape hours verbatim', () => {
      const html = render(formatHours({ monday: '9am-5pm' }));
      expect(html).toContain('9am-5pm');
    });
    it('prefers `display` over per-day rendering when present', () => {
      const html = render(
        formatHours({
          display: 'Mon-Fri 10:00-18:00; Sat 12:00-22:00',
          regular: [{ day: 1, open: '1000', close: '1800' }],
        }),
      );
      expect(html).toContain('Mon-Fri 10:00-18:00');
      expect(html).not.toContain('<span class="text-sm font-medium">Mon</span>');
    });
    it('renders from `regular` array (ISO day 1=Mon) when display absent', () => {
      const html = render(
        formatHours({
          regular: [
            { day: 1, open: '0900', close: '1700' },
            { day: 1, open: '1900', close: '2300' }, // split shift
            { day: 7, open: '1200', close: '2000' }, // Sun
          ],
        }),
      );
      expect(html).toContain('09:00–17:00, 19:00–23:00');
      expect(html).toContain('12:00–20:00');
      expect(html).toContain('Mon');
      expect(html).toContain('Sun');
    });
    it('handles next-day overflow times ("+0100")', () => {
      const html = render(
        formatHours({
          regular: [{ day: 6, open: '1500', close: '+0100' }],
        }),
      );
      expect(html).toContain('15:00');
      expect(html).toContain('01:00 (next day)');
    });
    it('hasUsableHours recognises the {display,regular} shape', () => {
      expect(hasUsableHours({ display: 'Mon 10-5' })).toBe(true);
      expect(hasUsableHours({ regular: [{ day: 1, open: '0900', close: '1700' }] })).toBe(true);
      expect(hasUsableHours({ display: '', regular: [] })).toBe(false);
    });
    it('never renders "[object Object]"', () => {
      const html = render(
        formatHours({
          monday: { open: '0900', close: '1700' },
          tuesday: { open: '1000', close: '2200' },
        }),
      );
      expect(html).not.toContain('[object Object]');
    });
  });
});
