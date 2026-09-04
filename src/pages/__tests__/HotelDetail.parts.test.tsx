/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/effects/ParallaxHero', () => ({ ParallaxHero: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
// AmenityDisplay (inside HotelOverview) reads the profile for matched-needs
// badges; stub it so no QueryClientProvider is needed here.
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
// HotelOverview's nearby-map block uses a react-query hook; stub it to an empty
// marker list so these renders stay provider-free (matches the pattern above).
vi.mock('@/hooks/useNearbyMapPoints', () => ({ useNearbyMapPoints: () => [] }));

import {
  HotelHero,
  HotelOverview,
  HotelSidebar,
  HotelPhotos,
  buildHotelBreadcrumbs,
} from '../HotelDetail.parts';

const hotel = {
  id: 'h1',
  name: 'Pride Hotel',
  city_id: 'c1',
  country_id: 'co1',
  images: [],
} as never;

describe('HotelDetail.parts', () => {
  it('HotelHero renders', () => {
    const { container } = render(
      <MemoryRouter>
        <HotelHero
          hotel={hotel}
          cityName="Berlin"
          countryName="Germany"
          tripCount={0}
          isInTrip={false}
          onAddToTrip={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('HotelOverview renders', () => {
    const { container } = render(<HotelOverview hotel={hotel} t={(_k, d) => d ?? _k} />);
    expect(container).toBeTruthy();
  });
  it('HotelSidebar renders', () => {
    const { container } = render(<HotelSidebar hotel={hotel} t={(_k, d) => d ?? _k} />);
    expect(container).toBeTruthy();
  });
  it('HotelPhotos renders', () => {
    const { container } = render(<HotelPhotos hotel={hotel} />);
    expect(container).toBeTruthy();
  });
});

const tt = ((_k: string, d?: string) => d ?? _k) as never;

describe('buildHotelBreadcrumbs', () => {
  // The defect: the hotel trail was the only detail type that rendered its
  // country and city as dead text — the join selected `id, name` and the
  // builder attached no href, so "Spain / Barcelona" were unclickable while
  // the identical crumbs on a venue in the same city were links.
  it('links every crumb above the hotel itself', () => {
    const crumbs = buildHotelBreadcrumbs(
      {
        name: 'Pride Hotel',
        cities: { id: 'c1', name: 'Barcelona', slug: 'barcelona' },
        countries: { id: 'co1', name: 'Spain', slug: 'spain' },
      } as never,
      tt,
    );
    expect(crumbs.map((c) => [c.label, c.href])).toEqual([
      ['Hotels', '/hotels'],
      ['Spain', '/country/spain'],
      ['Barcelona', '/city/barcelona'],
      ['Pride Hotel', undefined],
    ]);
    // Asserted as a property, not a list: every crumb but the last (the page
    // itself) must be reachable, whatever the trail grows to.
    expect(crumbs.slice(0, -1).every((c) => Boolean(c.href))).toBe(true);
  });

  it('falls back to the id when the geo row has no slug', () => {
    const crumbs = buildHotelBreadcrumbs(
      { name: 'X', cities: { id: 'c1', name: 'Barcelona' }, countries: null } as never,
      tt,
    );
    expect(crumbs.find((c) => c.label === 'Barcelona')?.href).toBe('/city/c1');
  });

  // Free-text `city`/`country` on a row with no FK has nothing to point at.
  // The crumb still carries the place NAME — a guessed slug would 404.
  it('keeps a free-text place as an unlinked label', () => {
    const crumbs = buildHotelBreadcrumbs(
      { name: 'X', city: 'Ava', country: 'United States' } as never,
      tt,
    );
    expect(crumbs.map((c) => [c.label, c.href])).toEqual([
      ['Hotels', '/hotels'],
      ['United States', undefined],
      ['Ava', undefined],
      ['X', undefined],
    ]);
  });
});
