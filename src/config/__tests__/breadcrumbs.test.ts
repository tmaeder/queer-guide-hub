import { describe, it, expect } from 'vitest';
import {
  getRouteBreadcrumbs,
  buildPlaceChain,
  homeCrumb,
  localeFromPath,
} from '@/config/breadcrumbs';

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

  // /places is retired — it redirects to the Travelling intent — so city and
  // country detail breadcrumbs point at /cities, the real browse page. They
  // deliberately do NOT point at an intent route: these breadcrumbs are a large
  // share of the internal links into the browse tier, and moving them would
  // transfer that link equity away from the pages that carry the rankings.
  it('maps city/country detail under Cities', () => {
    expect(getRouteBreadcrumbs('/city/berlin', t)?.[1]).toEqual({
      label: 'Cities',
      href: '/cities',
    });
    expect(getRouteBreadcrumbs('/country/germany', t)?.[1]).toEqual({
      label: 'Cities',
      href: '/cities',
    });
  });

  it('never points a breadcrumb at the retired /places route', () => {
    for (const path of ['/city/berlin', '/country/germany', '/venues/x', '/events/y']) {
      const trail = getRouteBreadcrumbs(path, t) ?? [];
      expect(trail.map((c) => c.href)).not.toContain('/places');
    }
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

describe('localeFromPath', () => {
  it('returns the active non-default locale', () => {
    expect(localeFromPath('/de/venues/soothr')).toBe('de');
    expect(localeFromPath('/ar')).toBe('ar');
  });
  it('returns null for the default locale and unprefixed paths', () => {
    expect(localeFromPath('/venues')).toBeNull();
    expect(localeFromPath('/en/venues')).toBeNull();
    expect(localeFromPath('/')).toBeNull();
  });
  it('ignores unsupported two-letter segments', () => {
    expect(localeFromPath('/xy/venues')).toBeNull();
  });
});
