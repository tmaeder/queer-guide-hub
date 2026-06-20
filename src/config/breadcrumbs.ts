import type { TFunction } from 'i18next';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import type { BreadcrumbItem } from '@/contexts/BreadcrumbContext';

/** Routes where no breadcrumb bar should ever render. */
const HIDDEN_PREFIXES = [
  '/auth',
  '/onboarding',
  '/extension',
  '/claim-username',
  '/map',
  '/pattern-library',
];

/**
 * First-path-segment → list/section the page (or its detail children) sits under.
 * `path` is the link target; `key`/`fallback` feed i18n `t(key, fallback)`.
 * Used to derive a breadcrumb trail for any route that doesn't publish its own.
 */
const SEGMENT_SECTIONS: Record<string, { path: string; key: string; fallback: string }> = {
  venues: { path: '/venues', key: 'breadcrumb.venues', fallback: 'Venues' },
  events: { path: '/events', key: 'breadcrumb.events', fallback: 'Events' },
  hotels: { path: '/hotels', key: 'breadcrumb.hotels', fallback: 'Hotels' },
  villages: { path: '/villages', key: 'breadcrumb.villages', fallback: 'Queer villages' },
  marketplace: { path: '/marketplace', key: 'breadcrumb.marketplace', fallback: 'Marketplace' },
  resources: { path: '/resources', key: 'breadcrumb.resources', fallback: 'Resources' },
  professions: { path: '/resources', key: 'breadcrumb.resources', fallback: 'Resources' },
  personalities: { path: '/personalities', key: 'breadcrumb.personalities', fallback: 'People' },
  news: { path: '/news', key: 'breadcrumb.news', fallback: 'News' },
  places: { path: '/places', key: 'breadcrumb.places', fallback: 'Places' },
  cities: { path: '/cities', key: 'breadcrumb.cities', fallback: 'Cities' },
  city: { path: '/places', key: 'breadcrumb.places', fallback: 'Places' },
  country: { path: '/places', key: 'breadcrumb.places', fallback: 'Places' },
  quests: { path: '/quests', key: 'breadcrumb.quests', fallback: 'Quests' },
  groups: { path: '/groups', key: 'breadcrumb.groups', fallback: 'Groups' },
  trips: { path: '/trips', key: 'breadcrumb.trips', fallback: 'Trips' },
  help: { path: '/help', key: 'breadcrumb.help', fallback: 'Help' },
  pride: { path: '/pride', key: 'breadcrumb.pride', fallback: 'Pride' },
  contributors: { path: '/contributors', key: 'breadcrumb.contributors', fallback: 'Contributors' },
  wishlists: { path: '/wishlists', key: 'breadcrumb.wishlists', fallback: 'Wishlists' },
};

/** Strip an optional supported-locale prefix so matching is locale-agnostic. */
function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/([a-z]{2})(\/|$)/);
  if (m && isSupportedLocale(m[1]) && m[1] !== DEFAULT_LOCALE) {
    return pathname.slice(m[1].length + 1) || '/';
  }
  return pathname;
}

/**
 * The active non-default locale encoded in the pathname, or null. The global
 * breadcrumb bar lives in LayoutShell (outside the `:locale?` Routes), so
 * `useParams()` can't see the locale — links derive it from the path instead.
 */
export function localeFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/([a-z]{2})(\/|$)/);
  return m && isSupportedLocale(m[1]) && m[1] !== DEFAULT_LOCALE ? m[1] : null;
}

export function homeCrumb(t: TFunction): BreadcrumbItem {
  return { label: t('breadcrumb.home', 'Home'), href: '/' };
}

/**
 * Derive a fallback breadcrumb trail from the pathname for pages that don't
 * publish their own (list/section pages). Returns `null` for home and any
 * hidden route, so the global bar renders nothing there.
 */
export function getRouteBreadcrumbs(pathname: string, t: TFunction): BreadcrumbItem[] | null {
  const path = stripLocale(pathname).replace(/\/+$/, '') || '/';
  if (path === '/') return null;
  if (HIDDEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const segment = path.split('/')[1];
  const section = SEGMENT_SECTIONS[segment];
  if (!section) return null;

  return [homeCrumb(t), { label: t(section.key, section.fallback), href: section.path }];
}

/**
 * Shared country→city chain for entity detail builders (venues, events, hotels,
 * villages…). Omits a segment when its FK record is absent.
 */
export function buildPlaceChain(opts: {
  countryName?: string | null;
  countrySlug?: string | null;
  cityName?: string | null;
  citySlug?: string | null;
}): BreadcrumbItem[] {
  const chain: BreadcrumbItem[] = [];
  if (opts.countryName) {
    chain.push({
      label: opts.countryName,
      href: opts.countrySlug ? `/country/${opts.countrySlug}` : undefined,
    });
  }
  if (opts.cityName) {
    chain.push({
      label: opts.cityName,
      href: opts.citySlug ? `/city/${opts.citySlug}` : undefined,
    });
  }
  return chain;
}
