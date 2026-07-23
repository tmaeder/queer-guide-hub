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
