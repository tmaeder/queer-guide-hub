/**
 * Per-route SEO metadata. Source of truth consumed by the Pages middleware.
 * Titles ≤ 60 chars, descriptions ≤ 155 chars (Google snippet limits).
 */

export type RouteMeta = {
  title: string;
  description: string;
  ogImage?: string;
};

export const SITE_ORIGIN = 'https://queer.guide';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/images/og-image.png`;

const DEFAULT_DESCRIPTION =
  'The global guide to LGBTQ+ venues, events, travel and community. Find safe spaces near you and around the world.';

export const DEFAULT_META: RouteMeta = {
  title: 'Queer Guide — LGBTQ+ Safe Spaces, Events & Community',
  description: DEFAULT_DESCRIPTION,
  ogImage: DEFAULT_OG_IMAGE,
};

export const STATIC_ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    title: 'Queer Guide — LGBTQ+ Safe Spaces, Events & Community',
    description: DEFAULT_DESCRIPTION,
  },
  '/venues': {
    title: 'LGBTQ+ Venues — Bars, Cafés, Safe Spaces | Queer Guide',
    description:
      'Discover queer-friendly bars, cafés, and safe spaces curated by the LGBTQ+ community worldwide.',
  },
  '/events': {
    title: 'LGBTQ+ Events Near You | Queer Guide',
    description:
      'Find Pride events, queer parties, drag shows, panels and meet-ups happening near you and globally.',
  },
  '/marketplace': {
    title: 'Queer-Owned Marketplace | Queer Guide',
    description:
      'Shop products and brands from queer-owned businesses, curated for relevance and quality.',
  },
  '/hotels': {
    title: 'LGBTQ+ Friendly Hotels & Stays | Queer Guide',
    description:
      'Welcoming, queer-friendly hotels and accommodations for safer travel — vetted by the community.',
  },
  '/places': {
    title: 'Queer Places — Cities, Neighborhoods, Villages | Queer Guide',
    description:
      'Browse cities, neighborhoods and queer villages around the world with LGBTQ+ life and history.',
  },
  '/travel': {
    title: 'LGBTQ+ Travel Guide — Safe Destinations | Queer Guide',
    description:
      'Plan safer queer travel. Country safety ratings, city guides, and trusted local recommendations.',
  },
  '/map': {
    title: 'LGBTQ+ World Map — Venues, Events, Safety | Queer Guide',
    description:
      'An interactive world map of queer venues, events, communities, and country-level safety information.',
  },
  '/users': {
    title: 'Community Directory | Queer Guide',
    description:
      'Browse community members, organizations and creators in the global queer directory.',
  },
  '/personalities': {
    title: 'Queer Personalities — People Who Shaped Us | Queer Guide',
    description:
      'Notable LGBTQ+ figures past and present — activists, artists, writers, scientists, and athletes.',
  },
  '/resources': {
    title: 'Queer Knowledge Hub — Resources & Guides | Queer Guide',
    description:
      'Articles, guides and references on queer history, health, identity and rights — by and for the community.',
  },
  '/news': {
    title: 'LGBTQ+ News — Curated Daily | Queer Guide',
    description:
      'A daily, ad-free feed of LGBTQ+ news from trusted outlets, deduplicated and tagged by topic.',
  },
  '/donate': {
    title: 'Support Queer Guide | Donate',
    description:
      'Queer Guide is independent and community-led. Donations keep the platform free, ad-free and queer-owned.',
  },
  '/sitemap': {
    title: 'Sitemap | Queer Guide',
    description: 'A human-readable index of every public section of Queer Guide.',
  },
  '/submit': {
    title: 'Submit a Venue, Event or Resource | Queer Guide',
    description:
      'Help grow the guide. Submit a venue, event, organization, or resource for the community to discover.',
  },
  '/feedback': {
    title: 'Send Feedback | Queer Guide',
    description: 'Tell us what to fix, what to add, and what is missing. Your feedback shapes the guide.',
  },
  '/help-hotlines': {
    title: 'LGBTQ+ Help Hotlines & Crisis Support | Queer Guide',
    description:
      'Free, confidential hotlines and crisis lines for LGBTQ+ people around the world. You are not alone.',
  },
  '/about-hub': {
    title: 'About Hub | Queer Guide',
    description: 'Learn about Queer Guide — our mission, values, vision, press, and the team behind it.',
  },
  '/about': {
    title: 'About Queer Guide — Our Mission',
    description:
      "Why we built Queer Guide, who's behind it, and how the platform stays community-led and independent.",
  },
  '/contact': {
    title: 'Contact Queer Guide',
    description: 'Get in touch with the Queer Guide team — partnerships, press, corrections, or just to say hi.',
  },
  '/vision': {
    title: 'Our Vision | Queer Guide',
    description:
      'A queer guide to the world — independent, community-led, and built to last. Read our long-term vision.',
  },
  '/values': {
    title: 'Our Values | Queer Guide',
    description:
      'Safety first, inclusivity by default, content over chrome. The values that guide every Queer Guide decision.',
  },
  '/press': {
    title: 'Press & Media | Queer Guide',
    description: 'Press releases, brand assets, and media inquiries for Queer Guide.',
  },
  '/blog': {
    title: 'Queer Guide Blog — Stories from the Community',
    description: 'Personal essays, reportage and field notes from queer writers around the world.',
  },
  '/sustainability': {
    title: 'Sustainability at Queer Guide',
    description:
      'How Queer Guide thinks about climate, durability, and building a platform that lasts beyond a hype cycle.',
  },
  '/legal': {
    title: 'Legal Information | Queer Guide',
    description: 'Imprint, legal entity, and contact information for Queer Guide.',
  },
  '/terms': {
    title: 'Terms of Service | Queer Guide',
    description: 'The terms that govern your use of Queer Guide.',
  },
  '/privacy': {
    title: 'Privacy Policy | Queer Guide',
    description: 'How Queer Guide collects, uses, and protects your data — written in plain language.',
  },
  '/cookies': {
    title: 'Cookie Policy | Queer Guide',
    description: 'How Queer Guide uses cookies and similar storage, and how you can opt out.',
  },
  '/dmca': {
    title: 'DMCA & Takedown Policy | Queer Guide',
    description: 'How to report copyright infringement on Queer Guide and how we respond to takedown notices.',
  },
  '/accessibility': {
    title: 'Accessibility Statement | Queer Guide',
    description:
      'Queer Guide aims for WCAG 2.2 AA. Our current accessibility status, known gaps, and how to report issues.',
  },
};

const TITLE_SUFFIX = ' | Queer Guide';
const MAX_TITLE = 60;
const MAX_DESC = 155;

const truncate = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;

const titlecase = (s: string) =>
  s
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Lgbtq\+?/i, 'LGBTQ+');

function dynamicMeta(pathname: string): RouteMeta | null {
  const match =
    /^\/(venue|venues|event|events|hotel|hotels|news|blog|personality|personalities|tag|tags|city|cities|country|countries|place|places|article|user|users)\/([^/?#]+)/.exec(
      pathname,
    );
  if (!match) return null;
  const [, kindRaw, slug] = match;
  const kind = kindRaw.replace(/s$/, '');
  const niceSlug = titlecase(decodeURIComponent(slug));
  const niceKind = titlecase(kind);
  return {
    title: truncate(`${niceSlug} — ${niceKind}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      `${niceSlug} on Queer Guide — ${niceKind} listing curated by the LGBTQ+ community.`,
      MAX_DESC,
    ),
  };
}

export function resolveMeta(pathname: string): RouteMeta {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const exact = STATIC_ROUTE_META[clean];
  if (exact) return { ogImage: DEFAULT_OG_IMAGE, ...exact };
  const dyn = dynamicMeta(clean);
  if (dyn) return { ogImage: DEFAULT_OG_IMAGE, ...dyn };
  return DEFAULT_META;
}

export function canonicalUrl(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return `${SITE_ORIGIN}${clean}`;
}

export function isIndexable(pathname: string): boolean {
  const noindex = [
    /^\/auth(\/|$)/,
    /^\/my-/,
    /^\/favorites(\/|$)/,
    /^\/admin(\/|$)/,
    /^\/profile(\/|$)/,
    /^\/settings(\/|$)/,
  ];
  return !noindex.some((r) => r.test(pathname));
}
