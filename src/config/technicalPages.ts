/**
 * The technical pages hub (/technical). One list, read by the page itself and
 * by the crawler body in functions/_lib/routeBody.ts, so the two cannot drift.
 *
 * `spa: true` entries are React routes (LocalizedLink). Everything else is
 * served outside the SPA — middleware pages (/docs, /pricing), Pages Functions
 * (/data/*, /sitemap.xml) or static files — and must be a full-page <a href>.
 */
export interface TechnicalLink {
  href: string;
  label: string;
  description: string;
  spa?: boolean;
}

export interface TechnicalGroup {
  id: string;
  title: string;
  links: TechnicalLink[];
}

export const TECHNICAL_GROUPS: TechnicalGroup[] = [
  {
    id: 'api',
    title: 'API and agents',
    links: [
      {
        href: '/docs',
        label: 'API and agent documentation',
        description: 'REST endpoints, Markdown negotiation and MCP access. No API key needed.',
      },
      {
        href: '/openapi.json',
        label: 'OpenAPI specification',
        description: 'OpenAPI 3.1 schema for the public read-only API.',
      },
      {
        href: '/api/v1/pages',
        label: 'Public pages API',
        description: 'JSON catalog of the introductory public pages.',
      },
      {
        href: '/llms.txt',
        label: 'llms.txt',
        description: 'Plain-text guide for language models and AI agents.',
      },
      {
        href: '/pricing',
        label: 'Pricing and access',
        description: 'What is free, what costs money, and what we pay vendors for.',
      },
    ],
  },
  {
    id: 'data',
    title: 'Open data',
    links: [
      {
        href: '/data/rights-by-country.json',
        label: 'Rights by country (JSON)',
        description: 'LGBTQ+ legal status for every country, machine-readable.',
      },
      {
        href: '/data/rights-by-country.csv',
        label: 'Rights by country (CSV)',
        description: 'The same dataset as a spreadsheet-ready CSV.',
      },
      {
        href: '/sitemap.xml',
        label: 'Sitemap',
        description: 'Index of every public page, split by content type.',
      },
    ],
  },
  {
    id: 'methods',
    title: 'Methods and sources',
    links: [
      {
        href: '/tags/rights-by-country/methodology',
        label: 'Equality score methodology',
        description: 'Every weight in the score, the tier cutoffs and the known limits.',
        spa: true,
      },
      {
        href: '/tags/rights-by-country/sources',
        label: 'Rights data sources',
        description: 'Where the legal data comes from and how often it is refreshed.',
        spa: true,
      },
    ],
  },
  {
    id: 'standards',
    title: 'Standards',
    links: [
      {
        href: '/accessibility',
        label: 'Accessibility statement',
        description: 'Our accessibility commitments and how to report a barrier.',
        spa: true,
      },
      {
        href: '/styleguide',
        label: 'Editorial styleguide',
        description: 'Voice rules and terminology, the same standard our pipelines use.',
        spa: true,
      },
      {
        href: '/brand',
        label: 'Brand guidelines',
        description: 'Colours, type, icons and how the system fits together.',
        spa: true,
      },
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    links: [
      {
        href: '/extension',
        label: 'Browser extension',
        description: 'Submit venues, events and news from any web page.',
        spa: true,
      },
      {
        href: '/app',
        label: 'Install the app',
        description: 'Add Queer Guide to your home screen.',
        spa: true,
      },
    ],
  },
];
