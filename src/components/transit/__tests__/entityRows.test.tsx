/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { venueStops, newsRows } from '../entityRows';

describe('venueStops — shared by the country and city singles', () => {
  const venues = Array.from({ length: 9 }, (_, i) => ({
    id: `v${i}`,
    name: `Venue ${i}`,
    slug: `venue-${i}`,
    category: 'bar',
    city: 'Berlin',
  }));

  it('caps at the limit and links each venue', () => {
    const stops = venueStops(venues as never);
    expect(stops).toHaveLength(6);
    expect(stops[0].href).toBe('/venues/venue-0');
    expect(stops[0].type).toBe('venue');
    // Venues scattered across a place are not a route — no gap is claimed.
    expect(stops[0].walkFromPrevious).toBeNull();
  });

  it('names the city on a country page and omits it on a city page', () => {
    // The whole reason the option exists: on /city/berlin every row would
    // otherwise end in "· Berlin".
    expect(venueStops(venues as never, { includeCity: true })[0].accessNote).toBe('bar · Berlin');
    expect(venueStops(venues as never, { includeCity: false })[0].accessNote).toBe('bar');
  });

  it('leaves the note null when there is nothing to say', () => {
    expect(venueStops([{ id: 'v', name: 'X', slug: 'x' }] as never)[0].accessNote).toBeNull();
  });
});

describe('newsRows', () => {
  it('caps at the limit and dates each headline', () => {
    const articles = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      title: `Headline ${i}`,
      slug: `headline-${i}`,
      published_at: '2026-08-14T10:00:00Z',
    }));
    const rows = newsRows(articles as never, { locale: 'en-GB', openLabel: 'Open' });
    expect(rows).toHaveLength(5);
    expect(rows[0].date).toBe('14 AUG');
    expect(rows[0].detail).toBe('Headline 0');
  });

  it('drops the link, not the row, for an article with no slug', () => {
    const rows = newsRows([{ id: 'a1', title: 'No slug', published_at: '2026-08-14' }] as never, {
      locale: 'en-GB',
      openLabel: 'Open',
    });
    expect(rows[0].action).toBeUndefined();
    expect(rows[0].detail).toBe('No slug');
  });

  it('leaves the date empty rather than printing Invalid Date', () => {
    const rows = newsRows([{ id: 'a', title: 'T', published_at: 'not-a-date' }] as never, {
      locale: 'en-GB',
      openLabel: 'Open',
    });
    expect(rows[0].date).toBe('');
  });
});
