import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { isServiceVenue, venueContactAction, venueOpenNow } from '../VenueDetail.parts';
import { rankNearbyVenues } from '@/hooks/useNearbyVenues';
import { upcomingVenueEvents } from '@/lib/venueEvents';

const base = {
  phone: null,
  email: null,
  website: null,
  url_status: null,
} as const;

describe('service-aware venue action', () => {
  it('treats a support-run or community venue as a service', () => {
    expect(
      isServiceVenue({
        category: 'bar',
        organizations: { slug: 'x', name: 'X', roles: ['support'] },
      }),
    ).toBe(true);
    expect(isServiceVenue({ category: 'community_center', organizations: null })).toBe(true);
    expect(
      isServiceVenue({
        category: 'bar',
        organizations: { slug: 'x', name: 'X', roles: ['venue'] },
      }),
    ).toBe(false);
  });

  it('prefers phone, then a valid email, then the website', () => {
    expect(venueContactAction({ ...base, phone: '+41 44 545 20 55', email: 'a@b.ch' })?.kind).toBe(
      'phone',
    );
    expect(venueContactAction({ ...base, email: 'info@haz.ch' })).toEqual({
      kind: 'email',
      href: 'mailto:info@haz.ch',
    });
    expect(
      venueContactAction({ ...base, email: 'not-an-email', website: 'https://triq.org' })?.kind,
    ).toBe('website');
    expect(venueContactAction({ ...base })).toBeNull();
  });

  it('does not use a known-dead website', () => {
    expect(
      venueContactAction({ ...base, website: 'https://x.org', url_status: 'broken' }),
    ).toBeNull();
  });

  it('reads open-now only from structured hours with a timezone', () => {
    const hours = { regular: [{ day: 1, open: '0900', close: '1700' }] };
    // Monday 2026-11-23 12:00 in Zürich.
    const now = new Date('2026-11-23T11:00:00Z');
    expect(venueOpenNow(hours, 'Europe/Zurich', now)).toBe(true);
    expect(venueOpenNow(hours, null, now)).toBeNull();
    expect(venueOpenNow({ display: 'Mon 9-5' }, 'Europe/Zurich', now)).toBeNull();
  });
});

type V = Parameters<typeof rankNearbyVenues>[1][number];
const v = (id: string, category: string, lat: number): V =>
  ({ id, category, latitude: lat, longitude: 8.5 }) as unknown as V;

describe('rankNearbyVenues', () => {
  it('puts the same category first, nearest first, then fills with others', () => {
    const groups = rankNearbyVenues({ category: 'bar', latitude: 47.0, longitude: 8.5 }, [
      v('shop', 'shop', 47.0),
      v('farBar', 'bar', 47.5),
      v('nearBar', 'bar', 47.01),
    ]);
    expect(groups.map((g) => g.relation)).toEqual(['same_category', 'same_city']);
    expect(groups[0].venues.map((x) => x.id)).toEqual(['nearBar', 'farBar']);
    expect(groups[1].venues.map((x) => x.id)).toEqual(['shop']);
  });

  it('never fills a community centre with unrelated businesses', () => {
    const groups = rankNearbyVenues(
      { category: 'community_center', latitude: 47, longitude: 8.5 },
      [v('shop', 'shop', 47.0), v('hotel', 'hotel', 47.0)],
    );
    expect(groups).toEqual([]);
  });
});

describe('upcomingVenueEvents', () => {
  it('keeps future events at this venue, soonest first', () => {
    const now = new Date('2026-11-27T00:00:00Z');
    const ev = (id: string, venue_id: string, start_date: string) =>
      ({ id, venue_id, start_date }) as Parameters<typeof upcomingVenueEvents>[0][number];
    const out = upcomingVenueEvents(
      [
        ev('late', 'v', '2026-12-20'),
        ev('past', 'v', '2026-11-01'),
        ev('other', 'w', '2026-12-01'),
        ev('soon', 'v', '2026-12-01'),
      ],
      'v',
      now,
    );
    expect(out.map((e) => e.id)).toEqual(['soon', 'late']);
  });
});
