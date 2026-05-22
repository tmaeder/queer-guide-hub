/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

import { getPriceRange, formatHours, hasUsableHours } from '../VenueDetail.parts';

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
