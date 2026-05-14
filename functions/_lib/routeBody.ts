/**
 * Route-specific body content served to crawler user agents in Phase 2.
 *
 * The SPA shell ships an empty <div id="root"></div> — Googlebot's first-pass
 * indexer sees nothing. The middleware injects this content only for bot UAs;
 * real users get the SPA shell unchanged. React 18's createRoot() (used by
 * src/main.tsx) replaces children rather than hydrating, so when the bot
 * eventually does its JS-rendering pass, the SPA mounts cleanly over our
 * injected content with no hydration mismatch.
 *
 * Each entry: an H1, 1-3 paragraphs of intro copy, a short list of internal
 * links so the crawler has somewhere to go next. Routes not listed here fall
 * through to a generic template built from routeMeta.
 */

export type RouteBody = {
  h1: string;
  paragraphs: string[];
  links?: { href: string; label: string }[];
};

const COMMON_FOOTER_LINKS = [
  { href: '/venues', label: 'Venues' },
  { href: '/events', label: 'Events' },
  { href: '/travel', label: 'Travel' },
  { href: '/news', label: 'News' },
  { href: '/resources', label: 'Knowledge' },
  { href: '/about', label: 'About' },
];

export const STATIC_ROUTE_BODY: Record<string, RouteBody> = {
  '/': {
    h1: 'Queer Guide — the global guide to LGBTQ+ life',
    paragraphs: [
      "Queer Guide is an independent, community-led platform for LGBTQ+ people and allies. We map the venues, events, businesses, hotels, news and people that make up queer life around the world — and we vet them so you don't have to.",
      'Find a bar in a city you have never been to. Plan a trip to a country and check whether it is safe for you to visit. Catch up on a curated, ad-free LGBTQ+ news feed. Discover queer-owned businesses you will actually want to buy from. Browse community events near you. All in one place, all queer-owned, all without trackers selling your data.',
      'We are not a directory dump and we are not venture-backed. The platform is funded by donations and partnerships with aligned organizations, and the editorial decisions are made by queer people. If you spot something missing or wrong, you can submit edits and we will act on them quickly.',
    ],
    links: [
      { href: '/venues', label: 'Browse LGBTQ+ venues' },
      { href: '/events', label: 'Find events near you' },
      { href: '/travel', label: 'Plan safer queer travel' },
      { href: '/marketplace', label: 'Shop queer-owned brands' },
      { href: '/news', label: 'Read curated LGBTQ+ news' },
      { href: '/about', label: 'About Queer Guide' },
    ],
  },

  '/venues': {
    h1: 'LGBTQ+ venues — bars, cafés, clubs, and safe spaces',
    paragraphs: [
      'Queer Guide tracks LGBTQ+ venues around the world: gay bars, lesbian bars, queer cafés, drag clubs, dance floors, community centers and bookstores. Every venue is reviewed for relevance to the community before it appears on the map.',
      "Filter by city, country, neighborhood, or by who the space is for — trans-friendly, lesbian-led, queer-owned, sober, BIPOC-led. Each venue page includes location, opening hours, amenities, photos, upcoming events, and links to the venue's own channels so you can verify before you go.",
      'Know a venue we are missing? Submit it and we will review and publish it. Spot something out of date? Edit it.',
    ],
    links: [
      { href: '/events', label: 'Events at queer venues' },
      { href: '/travel', label: 'Country safety guide' },
      { href: '/places', label: 'Browse by city or country' },
      { href: '/submit', label: 'Submit a venue' },
    ],
  },

  '/events': {
    h1: 'LGBTQ+ events — Pride, parties, panels, meet-ups',
    paragraphs: [
      'A live calendar of LGBTQ+ events worldwide: Pride marches, drag shows, queer parties, panel discussions, book launches, sports leagues, support groups, and small local meet-ups. Updated continuously from event sources we trust and curated by humans before publication.',
      'Every event page lists the date, time, venue, accessibility notes, ticket link, and tags so you can tell at a glance whether it is for you. Subscribe by RSS or iCal to keep your calendar in sync, or browse by city to plan a trip.',
    ],
    links: [
      { href: '/venues', label: 'Venues hosting events' },
      { href: '/places', label: 'Events by city' },
      { href: '/travel', label: 'Travel for Pride' },
      { href: '/submit', label: 'Submit an event' },
    ],
  },

  '/travel': {
    h1: 'LGBTQ+ travel — safer destinations and country guides',
    paragraphs: [
      "Queer travel is not the same as everyone else's travel. Queer Guide rates every country on legal status, social attitudes, and on-the-ground safety, and pairs that with city-level guides written by people who have actually been there.",
      'Plan trips knowing what to expect: where to stay, where to go out, what to avoid, what visa rules apply to same-sex partners, and which neighborhoods feel like home. Country pages link to the venues, events, and accommodations we trust on the ground.',
    ],
    links: [
      { href: '/places', label: 'Browse by country' },
      { href: '/hotels', label: 'LGBTQ+ friendly hotels' },
      { href: '/venues', label: 'Venues at your destination' },
      { href: '/help-hotlines', label: 'Crisis support abroad' },
    ],
  },

  '/news': {
    h1: 'LGBTQ+ news — daily, curated, ad-free',
    paragraphs: [
      "A daily feed of LGBTQ+ news drawn from trusted outlets, deduplicated, tagged by topic, and free of trackers and ads. We don't write the stories — we surface the ones that matter and credit the original sources.",
      'Filter by region, language, or topic — trans rights, same-sex marriage, healthcare access, hate-crime tracking, sport, culture, history. Sources we link to are vetted; sources we exclude are listed publicly so you can see our editorial criteria.',
    ],
    links: [
      { href: '/blog', label: 'Long-form essays' },
      { href: '/resources', label: 'Knowledge & guides' },
      { href: '/about', label: 'Editorial standards' },
    ],
  },

  '/marketplace': {
    h1: 'Queer-owned marketplace',
    paragraphs: [
      'Shop products and brands from LGBTQ+ owners and creators. Every listing is checked for queer ownership and editorial relevance before it appears — no rainbow-washing.',
      'Apparel, books, art, home goods, beauty, music, and more. Where a brand has a direct shop, we link to it. Where we earn affiliate revenue, we say so on the page; that revenue keeps Queer Guide free.',
    ],
    links: [
      { href: '/about', label: 'How we vet listings' },
      { href: '/donate', label: 'Other ways to support us' },
    ],
  },

  '/hotels': {
    h1: 'LGBTQ+ friendly hotels and accommodations',
    paragraphs: [
      "Stays where queer guests are genuinely welcome — not just tolerated. Each property listed has been vetted against community feedback and the operator's track record on LGBTQ+ inclusion.",
      'Browse by city, country, or proximity to nightlife and Pride events. Each page includes booking links, rates, neighborhood notes, and accessibility information.',
    ],
    links: [
      { href: '/travel', label: 'Country safety ratings' },
      { href: '/places', label: 'Browse by city' },
      { href: '/venues', label: 'What is nearby' },
    ],
  },

  '/resources': {
    h1: 'Queer Knowledge Hub — guides, references, and reading lists',
    paragraphs: [
      'A growing library of practical and historical resources for queer people. Coming-out guides, healthcare references, legal explainers by jurisdiction, glossaries, reading lists, archive pointers, and crisis resources.',
      "Written and reviewed by queer people. Where we link out, we say what we trust the source for and where its limits are. Where we don't have an answer, we say so.",
    ],
    links: [
      { href: '/help-hotlines', label: 'Crisis hotlines' },
      { href: '/news', label: 'News' },
      { href: '/personalities', label: 'Notable LGBTQ+ figures' },
    ],
  },

  '/personalities': {
    h1: 'Queer personalities — people who shaped us',
    paragraphs: [
      'Notable LGBTQ+ figures past and present: activists, artists, writers, scientists, athletes, and politicians. Each profile is short, sourced, and links onward to deeper material.',
      'Use the directory to discover queer history beyond the canonical names, or to look up someone you just heard about and want to learn more.',
    ],
    links: [
      { href: '/resources', label: 'Knowledge hub' },
      { href: '/blog', label: 'Long-form essays' },
    ],
  },

  '/places': {
    h1: 'Queer places — cities, neighborhoods, queer villages',
    paragraphs: [
      'A geographic index of queer life: cities with thriving scenes, neighborhoods historically shaped by LGBTQ+ communities, and "queer villages" around the world that exist because queer people built them.',
      'Each place page collects the venues, events, hotels, and history of that location, with pointers to safety information and travel tips.',
    ],
    links: [
      { href: '/venues', label: 'Venues' },
      { href: '/events', label: 'Events' },
      { href: '/travel', label: 'Travel safety' },
    ],
  },

  '/about': {
    h1: 'About Queer Guide',
    paragraphs: [
      "Queer Guide exists because the LGBTQ+ community deserves a resource that is queer-owned, ad-free, tracker-free, and built to last. We are independent — not venture-backed, not advertising-driven, not for sale.",
      'The platform is run by a small team and a wider network of contributors. Editorial decisions are made by queer people. We publish our funding sources, our moderation policies, and our limits in plain language.',
    ],
    links: [
      { href: '/vision', label: 'Our vision' },
      { href: '/values', label: 'Our values' },
      { href: '/press', label: 'Press' },
      { href: '/donate', label: 'Support the project' },
    ],
  },

  '/blog': {
    h1: 'Queer Guide Blog — stories from the community',
    paragraphs: [
      'Original essays, reportage and field notes from queer writers around the world. Long-form pieces that we publish because they matter, not because they perform.',
      'Pitches welcome. Read a few pieces to see the kind of work we publish, then send us yours.',
    ],
    links: [
      { href: '/news', label: 'Daily news feed' },
      { href: '/resources', label: 'Reference material' },
      { href: '/contact', label: 'Pitch us' },
    ],
  },

  '/donate': {
    h1: 'Support Queer Guide',
    paragraphs: [
      'Queer Guide is independent and ad-free. Donations and partnerships with aligned organizations are what keep it running. If the platform is useful to you, consider supporting it.',
      'One-time and recurring donations both help. We publish our funding sources transparently.',
    ],
  },

  '/help-hotlines': {
    h1: 'LGBTQ+ help hotlines and crisis support',
    paragraphs: [
      'Free, confidential hotlines and crisis lines for LGBTQ+ people, organized by country. If you are in immediate danger, call your local emergency number first — these lines are for support, not emergency dispatch.',
      'Lines we list have been verified for current operation and queer-affirming intake. If you find a number that is no longer working or that does not feel safe, please tell us.',
    ],
    links: [
      { href: '/resources', label: 'Other support resources' },
      { href: '/feedback', label: 'Report an outdated number' },
    ],
  },
};

const FALLBACK_PARAGRAPH_FOR = (description: string) =>
  `${description} This page is part of Queer Guide, the independent, community-led, ad-free guide to LGBTQ+ life worldwide.`;

export function buildBodyHtml(
  pathname: string,
  fallback: { title: string; description: string },
): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const entry = STATIC_ROUTE_BODY[clean];

  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  let h1: string;
  let paragraphs: string[];
  let links: { href: string; label: string }[];

  if (entry) {
    h1 = entry.h1;
    paragraphs = entry.paragraphs;
    links = entry.links ?? COMMON_FOOTER_LINKS;
  } else {
    h1 = fallback.title.replace(/\s*\|\s*Queer Guide.*$/, '').replace(/\s*—.*$/, '').trim() ||
      fallback.title;
    paragraphs = [FALLBACK_PARAGRAPH_FOR(fallback.description)];
    links = COMMON_FOOTER_LINKS;
  }

  const paragraphsHtml = paragraphs.map((p) => `<p>${escape(p)}</p>`).join('\n      ');
  const linksHtml = links
    .map((l) => `<li><a href="${escape(l.href)}">${escape(l.label)}</a></li>`)
    .join('\n        ');

  return `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(h1)}</h1>
      ${paragraphsHtml}
    </article>
    <nav aria-label="Site sections">
      <h2>Explore Queer Guide</h2>
      <ul>
        ${linksHtml}
      </ul>
    </nav>
  </main>`;
}
