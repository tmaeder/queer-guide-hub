/**
 * JSON-LD builders. Phase 1 emits Organization + WebSite on the homepage.
 * Detail-page schema (LocalBusiness, Event, Article) lands in Phase 3.
 */
import { SITE_ORIGIN, DEFAULT_OG_IMAGE } from './routeMeta';

const escapeJsonLd = (s: string) => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const renderLd = (obj: unknown) =>
  `<script type="application/ld+json">${escapeJsonLd(JSON.stringify(obj))}</script>`;

/** Optional DB-driven identity overrides (site_branding.meta). */
export type OrgOverrides = {
  site_name?: string;
  org_logo_url?: string;
  org_sameas?: string[];
};

export function organizationLd(overrides?: OrgOverrides) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: overrides?.site_name ?? 'Queer Guide',
    url: SITE_ORIGIN,
    logo: overrides?.org_logo_url ?? `${SITE_ORIGIN}/icons/icon-192.png`,
    sameAs: overrides?.org_sameas ?? [
      'https://www.instagram.com/queer.guide',
      'https://www.linkedin.com/company/queer-guide',
    ],
  };
}

export function websiteLd(overrides?: OrgOverrides) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: overrides?.site_name ?? 'Queer Guide',
    url: SITE_ORIGIN,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_ORIGIN}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    image: DEFAULT_OG_IMAGE,
  };
}

export function homepageJsonLd(overrides?: OrgOverrides): string {
  return [renderLd(organizationLd(overrides)), renderLd(websiteLd(overrides))].join('\n');
}

/**
 * BreadcrumbList for a detail page.
 *
 * Measured on production 2026-09-10: NO detail page emitted a BreadcrumbList,
 * and no hub page emitted any JSON-LD at all. Google renders breadcrumbs in the
 * result snippet in place of the raw URL, so this is the cheapest structured
 * data on the site — the trail is already implied by the path.
 *
 * The map keys on the FIRST path segment, and the singular forms are listed
 * because DETAIL_ROUTE_RE in detail.ts accepts them (`/venue/x`, `/tag/x`, …).
 * Several types share a hub: a city, a country and a village all sit under
 * /places, which is where the SPA lists them.
 */
const BREADCRUMB_PARENTS: Record<string, { label: string; path: string }> = {
  venue: { label: 'Venues', path: '/venues' },
  venues: { label: 'Venues', path: '/venues' },
  event: { label: 'Events', path: '/events' },
  events: { label: 'Events', path: '/events' },
  news: { label: 'News', path: '/news' },
  personality: { label: 'People', path: '/personalities' },
  personalities: { label: 'People', path: '/personalities' },
  city: { label: 'Places', path: '/places' },
  country: { label: 'Places', path: '/places' },
  village: { label: 'Places', path: '/places' },
  villages: { label: 'Places', path: '/places' },
  hotel: { label: 'Hotels', path: '/hotels' },
  hotels: { label: 'Hotels', path: '/hotels' },
  tag: { label: 'Glossary', path: '/tags' },
  tags: { label: 'Glossary', path: '/tags' },
  history: { label: 'History', path: '/history' },
  guides: { label: 'Guides', path: '/guides' },
};

const TITLE_SUFFIX = ' | Queer Guide';

/**
 * Returns a `<script type="application/ld+json">` BreadcrumbList, or '' when the
 * path is not a recognised detail route. Returning '' rather than a one-item
 * trail is deliberate: a breadcrumb that says only "Home" describes nothing and
 * is a Google rich-result warning.
 */
export function breadcrumbJsonLd(pathname: string, pageTitle: string): string {
  const segs = pathname.split('/').filter(Boolean);
  // TWO segments required. Keying on the first alone made the hub itself match:
  // `/venues` produced "Home > Venues > Venues", a self-referential trail whose
  // last two items share a URL. The middleware gates this on `detail`, so a hub
  // never reaches it there — but the function has to be correct on its own, and
  // a caller without that gate would have shipped the duplicate. Caught by the
  // unit test, not by review.
  if (segs.length < 2) return '';
  const parent = BREADCRUMB_PARENTS[segs[0].toLowerCase()];
  if (!parent) return '';

  // The leaf is the page's own title with the site suffix removed — the suffix
  // is chrome, and repeating it inside a breadcrumb reads as a second site name.
  //
  // The second replace handles a TRUNCATED suffix, which `endsWith` cannot see.
  // detail.ts truncates titles to MAX_TITLE=60 and long names run into the
  // suffix, so a real hotel produced
  // "Billy's Resort -Men only- Voyr Bungalow — Wilton Manors |…" — the leaf kept
  // a dangling "|…" that reads as broken markup in a result snippet. Only a
  // TRAILING pipe (with optional ellipsis) is stripped, so a title that
  // legitimately contains "|" mid-string is untouched.
  const leaf = (pageTitle.endsWith(TITLE_SUFFIX)
    ? pageTitle.slice(0, -TITLE_SUFFIX.length)
    : pageTitle
  )
    .replace(/\s*\|\s*(?:…|\.\.\.)?\s*$/, '')
    .trim();
  if (!leaf) return '';

  return renderLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN },
      {
        '@type': 'ListItem',
        position: 2,
        name: parent.label,
        item: `${SITE_ORIGIN}${parent.path}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: leaf,
        item: `${SITE_ORIGIN}${pathname}`,
      },
    ],
  });
}
