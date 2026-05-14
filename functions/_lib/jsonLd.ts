/**
 * JSON-LD builders. Phase 1 emits Organization + WebSite on the homepage.
 * Detail-page schema (LocalBusiness, Event, Article) lands in Phase 3.
 */
import { SITE_ORIGIN, DEFAULT_OG_IMAGE } from './routeMeta';

const escapeJsonLd = (s: string) => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const renderLd = (obj: unknown) =>
  `<script type="application/ld+json">${escapeJsonLd(JSON.stringify(obj))}</script>`;

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Queer Guide',
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/icons/icon-192.png`,
    sameAs: [
      'https://www.instagram.com/queer.guide',
      'https://www.linkedin.com/company/queer-guide',
    ],
  };
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Queer Guide',
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

export function homepageJsonLd(): string {
  return [renderLd(organizationLd()), renderLd(websiteLd())].join('\n');
}
