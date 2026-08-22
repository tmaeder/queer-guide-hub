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
  // "Queer-Owned Marketplace" until 2026-08: only 24 of 2,583 brands carry
  // ownership_tags (0.93%), so a page-level ownership claim was indexed against
  // a catalogue that is 99% unverified. Ownership is a labelled property of the
  // brands we have actually checked, never an adjective for the whole shelf.
  '/marketplace': {
    title: 'LGBTQ+ Marketplace — Books, Fashion, Gifts | Queer Guide',
    description:
      'Shop books, fashion, art and gifts for the LGBTQ+ community. Queer-owned brands are labelled where we have verified ownership.',
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
  // Without an exact entry, dynamicMeta() reads this as `/city/:slug` and
  // titles the page "Compare — City".
  '/city/compare': {
    title: 'Compare Cities Side by Side | Queer Guide',
    description:
      'Compare two cities on LGBTQ+ equality score, currency, language, timezone and airport before you travel.',
  },
  '/travel': {
    title: 'Plan LGBTQ+ Trips — Queer Travel Planner | Queer Guide',
    description:
      'Build a queer trip in one place: pick a destination on the map, plan the days, and book flights, stays and activities — with the legal picture built in.',
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
  '/history': {
    title: 'Queer History Timeline — Milestones | Queer Guide',
    description:
      'Milestones of LGBTQ+ history: uprisings, decriminalizations, marriage equality and setbacks — dated, sourced, worldwide.',
  },
  '/personalities': {
    title: 'Queer Personalities — People Who Shaped Us | Queer Guide',
    description:
      'Notable LGBTQ+ figures past and present — activists, artists, writers, scientists, and athletes.',
  },
  // The tag glossary lives at /tags; /resources is a legacy redirect to it, so
  // the canonical page — and the route the SEO check samples — is /tags. Copy
  // mirrors the client-side `useMeta` call in src/pages/TagsIndex.tsx.
  // Category pages (/tags/c/:slug) are handled by dynamicMeta below.
  '/tags': {
    title: 'LGBTQ+ Glossary & Tag Index | Queer Guide',
    description:
      'Browse and search LGBTQ+ terms — identities, practices, history and community language, each linked to the venues, events, people and news that use it.',
  },
  // Needs an exact entry for the same reason /tags/c/:slug needed a branch in
  // dynamicMeta: the generic `/(tag|tags)/([^/]+)` matcher reads this as
  // kind=tag, slug="interactions" and served crawlers
  // "Interactions — Tag | Queer Guide" plus a templated "Tag listing curated by
  // the LGBTQ+ community" description. Adding it to RESERVED_DETAIL_SLUGS
  // (functions/_lib/detail.ts) only stopped the hard 404 — the meta table is a
  // separate surface and still mis-titled the page.
  '/tags/interactions': {
    title: 'Drug Interaction Chart | Queer Guide',
    description:
      'Which substances are dangerous to combine — 421 combinations across 31 drugs, with harm-reduction data researched by TripSit.',
  },
  // Same reason as /tags/interactions above: without an exact entry the
  // generic tag matcher would title this "Sti-guide — Tag".
  '/tags/sti-guide': {
    title: 'STI Guide — Transmission, Testing, Protection | Queer Guide',
    description:
      'How STIs spread, when a test can detect them, and which prevention method protects against which infection — a harm-reduction reference.',
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
    description:
      'Tell us what to fix, what to add, and what is missing. Your feedback shapes the guide.',
  },
  // P4.3 — /help is the live canonical for the crisis hub (HelpHotlines
  // renders both /help and /help/:country). /help-hotlines is the legacy
  // URL. It was never a React Router route, so "keeping it indexable" gave
  // it real meta but an SPA 404 body; it now 301s to /help from
  // public/_redirects and so can never reach this table.
  '/help': {
    title: 'LGBTQ+ help hotlines, crisis lines, and country resources | Queer Guide',
    description:
      'Free, confidential LGBTQ+ help hotlines and crisis lines worldwide, organized by country. Verified, queer-affirming, ad-free.',
  },
  '/about-hub': {
    title: 'About Hub | Queer Guide',
    description:
      'Learn about Queer Guide — our mission, values, vision, press, and the team behind it.',
  },
  '/about': {
    title: 'About Queer Guide — Our Mission',
    description:
      "Why we built Queer Guide, who's behind it, and how the platform stays community-led and independent.",
  },
  '/contact': {
    title: 'Contact Queer Guide',
    description:
      'Get in touch with the Queer Guide team — partnerships, press, corrections, or just to say hi.',
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
    description:
      'How Queer Guide collects, uses, and protects your data — written in plain language.',
  },
  '/cookies': {
    title: 'Cookie Policy | Queer Guide',
    description: 'How Queer Guide uses cookies and similar storage, and how you can opt out.',
  },
  '/dmca': {
    title: 'DMCA & Takedown Policy | Queer Guide',
    description:
      'How to report copyright infringement on Queer Guide and how we respond to takedown notices.',
  },
  '/accessibility': {
    title: 'Accessibility Statement | Queer Guide',
    description:
      'Queer Guide aims for WCAG 2.2 AA. Our current accessibility status, known gaps, and how to report issues.',
  },
  // Intent Router landing pages. Each targets a TASK query ("what to do tonight
  // gay berlin", "is it safe for gay travellers in qatar") rather than an
  // entity/category query, so they complement /venues, /events and /city/:slug
  // instead of competing with them. Canonical is the bare path — the middleware
  // strips the query string, so ?city= variants can never fan out into
  // thousands of thin near-duplicates.
  '/going-out': {
    title: 'Going Out — LGBTQ+ Bars, Clubs and Nightlife',
    description:
      'Where to go out tonight: queer bars, clubs, cafes and saunas, plus what is actually on, wherever you are.',
  },
  // /people is linked from the mobile sheet and the search popover, and is now
  // the sixth intent, but had NO entry here — so resolveMeta fell through to
  // DEFAULT_META, whose title is byte-identical to the homepage's, and
  // sitemap-static.xml (Object.keys(STATIC_ROUTE_META)) omitted it entirely.
  // The description tracks the page, which is now place-led: it opens on the
  // community spaces, groups and events where people actually gather, because
  // the member pool is 17 profiles and a matching-led page rendered empty for
  // every visitor. Promising "find friends, dates and travel buddies" here
  // while the page leads with venues is exactly the crawler/user divergence
  // this entry was originally added to fix.
  '/people': {
    title: 'Meet LGBTQ+ People — Groups, Spaces and Events',
    description:
      'Where queer people actually gather: community spaces, groups, events and bars near you, plus the members and travel buddies you can meet.',
  },
  '/rights': {
    title: 'LGBTQ+ Rights and Safety by Country',
    description:
      'Legal status for LGBTQ+ people in all 250 countries and territories: criminalisation, partnership recognition and equality scores.',
  },
  // Must be registered here, not just in src/routes.tsx: this map is both the
  // crawler's <head> source and what sitemap-static.xml enumerates, so a route
  // missing from it is served the homepage title and never listed.
  '/rights/sources': {
    title: 'Where Our LGBTQ+ Rights Data Comes From',
    description:
      'The source, refresh cadence, coverage and known limits behind the legal status we publish for every country and territory.',
  },
  '/rights/trans': {
    title: 'Trans Rights and Safety by Country',
    description:
      'Legal gender recognition worldwide, what changing a document costs, and TGEU’s record of documented anti-trans violence — kept separate, never combined into a score.',
  },
  '/support': {
    title: 'Find LGBTQ+ Support Organizations Near You',
    description:
      'Support organizations, advocacy groups and crisis helplines for LGBTQ+ people, listed by country with direct links.',
  },
  // No '/shop' entry: it 301s to /marketplace at the edge. A meta entry for a
  // redirect source is dead code AND puts the URL in sitemap-static.xml (which
  // is Object.keys(STATIC_ROUTE_META).filter(isIndexable)), i.e. a sitemap that
  // advertises a redirect. routeMetaContract.test.ts fails on it.
  // Backfill (2026-08): these five are linked from nav, the mobile sheet or the
  // footer but had no entry here, so resolveMeta fell through to DEFAULT_META —
  // whose title is byte-identical to the homepage's — and sitemap-static.xml,
  // which is Object.keys(STATIC_ROUTE_META).filter(isIndexable), omitted them
  // entirely. A route missing from this table is invisible to the sitemap and
  // duplicates the homepage title; keep new public routes in sync with it.
  '/guides': {
    title: 'LGBTQ+ Guides, Lists and Quests | Queer Guide',
    description:
      'Editorial guides, curated lists and community quests for queer travel, nightlife, culture and local scenes worldwide.',
  },
  '/cities': {
    title: 'LGBTQ+ City Guides Worldwide | Queer Guide',
    description:
      'Queer city guides with rights and safety context, venues, events, neighborhoods and local history for cities worldwide.',
  },
  '/organizations': {
    title: 'LGBTQ+ Organizations and Support Groups',
    description:
      'A directory of LGBTQ+ support organizations, advocacy groups, publishers and sellers, searchable by role and country.',
  },
  '/pride': {
    title: 'Pride Events and Parades by Year | Queer Guide',
    description:
      'Pride marches, parades and festivals around the world, listed by year with dates, host cities and what to expect.',
  },
  '/community': {
    title: 'Queer Community — Feed, Groups, Members',
    description:
      'Connect with the Queer Guide community: the shared feed, local groups, and members near you or at your destination.',
  },
  // The three community tabs are the outbound links in /people's own crawler
  // body (routeBody.ts), and all three fell through to DEFAULT_META — so the
  // /people fix pointed Googlebot at three URLs that each served the homepage
  // title. `resolveMeta` is an exact match; a parent entry does not cover
  // children.
  '/community/groups': {
    title: 'LGBTQ+ Groups to Join — Local and Interest',
    description:
      'Local and interest-based LGBTQ+ groups you can join, from book clubs and hiking to professional networks and peer support.',
  },
  '/community/feed': {
    title: 'Community Feed — What Queer People Are Posting',
    description:
      'What the Queer Guide community is posting right now: recommendations, questions, meet-ups and news from members worldwide.',
  },
  '/community/members': {
    title: 'Browse LGBTQ+ Community Members',
    description:
      'Browse the members who have chosen to be listed on Queer Guide, with the interests, pronouns and cities they have shared.',
  },
  // /community/friends is the signed-in friends list. Same class as /hub — a
  // personal surface with nothing public to render — so it is noindexed in
  // isIndexable() below rather than given meta.
  '/travel/book': {
    title: 'Book LGBTQ+ Friendly Flights, Stays and Tours',
    description:
      'Book the pieces of a queer trip — flights, stays, transfers and activities — with the legal and safety picture for the destination alongside.',
  },
  // The remaining three targets of STATIC_ROUTE_BODY links that resolved to
  // DEFAULT_META. A crawler body exists to give the bot somewhere to go next;
  // sending it to three pages titled like the homepage defeats the point.
  '/trips/discover': {
    title: 'Public LGBTQ+ Trip Itineraries to Copy',
    description:
      'Trip itineraries shared by the community: day-by-day plans for Pride weekends and longer queer trips, ready to copy and adapt.',
  },
  '/marketplace/categories': {
    title: 'Shop LGBTQ+ Products by Category',
    description:
      'Every marketplace category in one place — books, apparel, art, home, beauty and gifts made for and about the LGBTQ+ community.',
  },
  '/wishlists': {
    title: 'LGBTQ+ Gift Wishlists to Share',
    description:
      'Build and share a wishlist of queer books, apparel, art and gifts, so the people buying for you know what you actually want.',
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
  // Glossary category pages, ahead of the generic matcher below — which would
  // otherwise read `/tags/c/health-wellness` as kind=tag, slug="c" and title
  // all 56 of them "C — Tag | Queer Guide". These URLs became indexable when
  // the category moved from a query param into the path.
  const category = /^\/tags\/c\/([^/?#]+)/.exec(pathname);
  if (category) {
    const nice = titlecase(decodeURIComponent(category[1]));
    return {
      title: truncate(`${nice} — LGBTQ+ Glossary${TITLE_SUFFIX}`, MAX_TITLE),
      description: truncate(
        `Every ${nice.toLowerCase()} term in the Queer Guide glossary, linked to the venues, events, people and news that use it.`,
        MAX_DESC,
      ),
    };
  }

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

/** DB-driven identity defaults (site_branding). Absent fields fall back to the
 * compiled-in constants so a failed fetch reproduces today's output exactly. */
export type MetaOverrides = {
  default_title?: string;
  default_description?: string;
  og_image_url?: string;
};

export function resolveMeta(pathname: string, overrides?: MetaOverrides): RouteMeta {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const fallbackOg = overrides?.og_image_url ?? DEFAULT_OG_IMAGE;
  const exact = STATIC_ROUTE_META[clean];
  if (exact) return { ogImage: fallbackOg, ...exact };
  const dyn = dynamicMeta(clean);
  if (dyn) return { ogImage: fallbackOg, ...dyn };
  return {
    title: overrides?.default_title ?? DEFAULT_META.title,
    description: overrides?.default_description ?? DEFAULT_META.description,
    ogImage: fallbackOg,
  };
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
    // Query-shaped and personal surfaces: /search is an infinite parameter
    // space and /hub is the signed-in personal area. Note this also suppresses
    // the crawler body injection for them (functions/_middleware.ts gates the
    // bot body on `indexable`), which is intended — there is nothing static to
    // serve — but it means neither may be added to ROUTES in
    // scripts/seo-check.mjs, whose botH1/botBodySize assertions would fail.
    /^\/search(\/|$)/,
    /^\/hub(\/|$)/,
    // The four /people matching modes. resolveMeta is an exact match, so these
    // had no entry and served DEFAULT_META — the homepage title, on four
    // separate URLs. They are also signed-in surfaces with nothing public to
    // show: friends/travel/nearby render a sign-in notice to anon, and dating
    // is an age-walled opt-in deck. Same class as /search and /hub above, so
    // they are suppressed rather than given four near-duplicate titles that
    // would compete with /people itself. The hub at /people stays indexable and
    // is the one that carries the content. Per the note above, none of these
    // may be added to ROUTES in scripts/seo-check.mjs (verified: they are not).
    /^\/people\/(friends|dating|travel|nearby)(\/|$)/,
    // The signed-in friends list. Nothing public to render, same class as /hub.
    /^\/community\/friends(\/|$)/,
    // /shop folded into /marketplace. public/_redirects 301s the whole subtree
    // at the edge, so this is the defensive second layer — it matters off
    // Cloudflare (dev, `vite preview`, e2e) and for localized `/de/shop`, which
    // the unprefixed edge rule cannot catch and which the router redirects only
    // after serving a 200. Now covers `/shop` itself as well as its children:
    // before the fold, the bare path was a real indexable page.
    /^\/shop(\/|$)/,
  ];
  return !noindex.some((r) => r.test(pathname));
}

export const SUPPORTED_LOCALES = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'ru',
  'zh',
  'ja',
  'ko',
  'ar',
] as const;
export const DEFAULT_LOCALE = 'en';

const LOCALE_RE = new RegExp(`^/(${SUPPORTED_LOCALES.join('|')})(/|$)`);

/**
 * Splits a pathname into its locale prefix and the locale-agnostic base path.
 * The default-locale ("en") version of any URL has no prefix; all other
 * locales prefix their two-letter code, per src/routes.tsx (LocaleRouter).
 */
export function splitLocale(pathname: string): { locale: string; basePath: string } {
  const match = pathname.match(LOCALE_RE);
  if (!match) return { locale: DEFAULT_LOCALE, basePath: pathname };
  const locale = match[1];
  const basePath = pathname.slice(match[0].length - (match[2] === '/' ? 1 : 0)) || '/';
  return { locale, basePath };
}

/**
 * Builds the absolute URL for a given (locale, basePath) pair. The default
 * locale gets no prefix; any other locale gets `/{code}`.
 */
export function localizedUrl(locale: string, basePath: string): string {
  const clean = basePath.replace(/\/+$/, '') || '/';
  if (locale === DEFAULT_LOCALE) return `${SITE_ORIGIN}${clean}`;
  return `${SITE_ORIGIN}/${locale}${clean === '/' ? '' : clean}`;
}
