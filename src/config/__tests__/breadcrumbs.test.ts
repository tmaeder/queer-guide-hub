import { describe, it, expect } from 'vitest';
import { getRouteBreadcrumbs, buildPlaceChain, homeCrumb } from '@/config/breadcrumbs';

// Minimal i18n stub: return the provided default string.
const t = ((_key: string, def: string) => def) as never;

describe('getRouteBreadcrumbs', () => {
  it('returns null on the home route', () => {
    expect(getRouteBreadcrumbs('/', t)).toBeNull();
  });

  it('returns null on hidden routes (map, auth, onboarding)', () => {
    expect(getRouteBreadcrumbs('/map', t)).toBeNull();
    expect(getRouteBreadcrumbs('/auth/callback', t)).toBeNull();
    expect(getRouteBreadcrumbs('/onboarding/search', t)).toBeNull();
  });

  it('returns null for unknown top-level routes', () => {
    expect(getRouteBreadcrumbs('/totally-unknown', t)).toBeNull();
  });

  it('builds Home / Venues for the venues list', () => {
    const trail = getRouteBreadcrumbs('/venues', t);
    expect(trail).toEqual([
      { label: 'Home', href: '/' },
      { label: 'Venues', href: '/venues' },
    ]);
  });

  it('strips the dynamic detail segment to the parent list (fallback)', () => {
    const trail = getRouteBreadcrumbs('/venues/some-slug', t);
    expect(trail).toEqual([
      { label: 'Home', href: '/' },
      { label: 'Venues', href: '/venues' },
    ]);
  });

  it('maps city/country detail under Places', () => {
    expect(getRouteBreadcrumbs('/city/berlin', t)?.[1]).toEqual({
      label: 'Places',
      href: '/places',
    });
    expect(getRouteBreadcrumbs('/country/germany', t)?.[1]).toEqual({
      label: 'Places',
      href: '/places',
    });
  });

  it('is locale-agnostic (strips a supported non-default locale prefix)', () => {
    expect(getRouteBreadcrumbs('/de/venues', t)).toEqual([
      { label: 'Home', href: '/' },
      { label: 'Venues', href: '/venues' },
    ]);
  });
});

describe('buildPlaceChain', () => {
  it('omits absent segments', () => {
    expect(buildPlaceChain({ countryName: null, cityName: null })).toEqual([]);
  });

  it('links country and city by slug', () => {
    expect(
      buildPlaceChain({
        countryName: 'Germany',
        countrySlug: 'germany',
        cityName: 'Berlin',
        citySlug: 'berlin',
      }),
    ).toEqual([
      { label: 'Germany', href: '/country/germany' },
      { label: 'Berlin', href: '/city/berlin' },
    ]);
  });

  it('drops the href when slug is missing', () => {
    expect(buildPlaceChain({ cityName: 'Nowhere', citySlug: null })).toEqual([
      { label: 'Nowhere', href: undefined },
    ]);
  });
});

describe('homeCrumb', () => {
  it('points at the root', () => {
    expect(homeCrumb(t)).toEqual({ label: 'Home', href: '/' });
  });
});
