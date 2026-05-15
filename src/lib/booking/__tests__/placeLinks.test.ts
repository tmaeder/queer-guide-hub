import { describe, it, expect } from 'vitest';
import { buildPlaceBookableLinks } from '../placeLinks';

function find(links: ReturnType<typeof buildPlaceBookableLinks>, provider: string) {
  return links.find(l => l.provider === provider);
}

describe('buildPlaceBookableLinks', () => {
  describe('No query available', () => {
    it('returns empty array when no name and no cityName', () => {
      expect(
        buildPlaceBookableLinks({ category: 'venue', name: '' }),
      ).toEqual([]);
    });
  });

  describe('Hotel category', () => {
    it('builds a Booking.com link with name as query', () => {
      const links = buildPlaceBookableLinks({
        category: 'hotel',
        name: 'Hotel X',
        cityName: 'Berlin',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
      });
      const booking = find(links, 'booking');
      expect(booking).toBeDefined();
      const u = new URL(booking!.url);
      expect(u.origin + u.pathname).toBe('https://www.booking.com/searchresults.html');
      expect(u.searchParams.get('ss')).toBe('Hotel X');
      expect(u.searchParams.get('aid')).toBe('2381426');
      expect(u.searchParams.get('label')).toBe('queerguide-452012');
      expect(u.searchParams.get('checkin')).toBe('2026-06-01');
      expect(u.searchParams.get('checkout')).toBe('2026-06-05');
    });

    it('adds a GetYourGuide tours link when city is known', () => {
      const links = buildPlaceBookableLinks({
        category: 'hotel',
        name: 'Hotel X',
        cityName: 'Berlin',
      });
      const gyg = find(links, 'getyourguide');
      expect(gyg?.vertical).toBe('activity');
      expect(gyg?.url).toMatch(/getyourguide\.com\/s\//);
      expect(gyg?.url).toContain('partner_id=2PBDXWH');
    });

    it('omits GetYourGuide when cityName is missing', () => {
      const links = buildPlaceBookableLinks({
        category: 'hotel',
        name: 'Some Hotel',
      });
      expect(find(links, 'getyourguide')).toBeUndefined();
      // Booking still appears because name is the query.
      expect(find(links, 'booking')).toBeDefined();
    });
  });

  describe('Venue / event / custom category', () => {
    it.each(['venue', 'event', 'custom'] as const)(
      'returns a GetYourGuide tours link for %s when city is known',
      category => {
        const links = buildPlaceBookableLinks({
          category,
          name: 'Berghain',
          cityName: 'Berlin',
          startDate: '2026-06-01',
        });
        expect(links).toHaveLength(1);
        const gyg = links[0];
        expect(gyg.provider).toBe('getyourguide');
        expect(gyg.label).toBe('Tours & tickets');
        // URLSearchParams encodes spaces as +.
        expect(gyg.url).toContain('q=Berghain+Berlin');
        expect(gyg.url).toContain('date_from=2026-06-01');
      },
    );

    it('returns empty array for venue without cityName', () => {
      const links = buildPlaceBookableLinks({ category: 'venue', name: 'Berghain' });
      expect(links).toEqual([]);
    });
  });
});
