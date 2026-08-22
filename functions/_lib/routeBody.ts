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
  { href: '/tags', label: 'Knowledge' },
  { href: '/about', label: 'About' },
];

export const STATIC_ROUTE_BODY: Record<string, RouteBody> = {
  '/': {
    h1: 'Queer Guide — the global guide to LGBTQ+ life',
    paragraphs: [
      "Queer Guide is an independent, community-led platform for LGBTQ+ people and allies. We map the venues, events, businesses, hotels, news and people that make up queer life around the world — and we vet them so you don't have to.",
      'Find a bar in a city you have never been to. Plan a trip to a country and check whether it is safe for you to visit. Catch up on a curated, ad-free LGBTQ+ news feed. Shop books, apparel and art made for the community. Browse community events near you. All in one place, all queer-owned, all without trackers selling your data.',
      'We are not a directory dump and we are not venture-backed. The platform is funded by donations and partnerships with aligned organizations, and the editorial decisions are made by queer people. If you spot something missing or wrong, you can submit edits and we will act on them quickly.',
    ],
    links: [
      { href: '/venues', label: 'Browse LGBTQ+ venues' },
      { href: '/events', label: 'Find events near you' },
      { href: '/travel', label: 'Plan safer queer travel' },
      { href: '/marketplace', label: 'Shop the LGBTQ+ marketplace' },
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

  // '/cities' had a STATIC_ROUTE_META entry and NO body entry, and _middleware.ts
  // gates the crawler body on both — so the site's canonical city index served
  // bots a title, a description and nothing else. Every other route in this file
  // links TO /cities; /cities itself was the gap.
  '/cities': {
    h1: 'LGBTQ+ cities — where the map is thickest',
    paragraphs: [
      'A directory of cities worldwide ranked by how much queer life we actually hold for each one: bars, clubs, saunas, cafés, bookshops and community spaces, the queer districts they cluster in, and the Pride events coming up. Berlin, San Francisco, New York, London, Paris, Barcelona, Madrid and Amsterdam lead, but so do Brighton, Sitges, Palm Springs, Puerto Vallarta and West Hollywood — small places with dense queer life that a population ranking buries.',
      'Every city carries its country’s equality score and, where the law criminalises us, says so plainly on the card rather than leaving you to work it out at the airport. Filter by continent or by legal climate, search by name, or open the map to see the whole world coloured by rights.',
    ],
    links: [
      { href: '/travel', label: 'Plan a trip' },
      { href: '/map', label: 'The world map' },
      { href: '/venues', label: 'Venues by city' },
      { href: '/events', label: 'Events by city' },
      { href: '/rights', label: 'LGBTQ+ rights by country' },
    ],
  },

  '/travel': {
    h1: 'Plan LGBTQ+ trips — destinations, itineraries and bookings',
    paragraphs: [
      'Queer Guide is a trip planner built for queer travelers: pick a destination on the world map of cities, queer villages and pride events, build a day-by-day itinerary with venues, events and stays, and book flights, hotels and activities through trusted partners.',
      "The legal picture is built in, not bolted on. Every country carries its criminalisation status and equality score, every destination shows it before you book, and each trip gets a full safety briefing — because queer travel is not the same as everyone else's travel.",
    ],
    links: [
      { href: '/cities', label: 'Browse cities' },
      { href: '/trips/discover', label: 'Public trip itineraries' },
      { href: '/hotels', label: 'LGBTQ+ friendly hotels' },
      { href: '/venues', label: 'Venues at your destination' },
      { href: '/help', label: 'Crisis support abroad' },
    ],
  },

  '/history': {
    h1: 'Queer history timeline — milestones of LGBTQ+ life worldwide',
    paragraphs: [
      'Thousands of dated, sourced milestones of LGBTQ+ history, organized into narrative eras: hidden lives before 1800, criminalization under empire, the birth of a movement (1868–1932), destruction under fascism, the homophile years, liberation after Stonewall (1969–1981), the AIDS crisis, legal recognition, the marriage-equality wave of the 2010s, and the backlash of the present day.',
      'Every milestone names its date, place, and sources — uprisings and firsts alongside criminalization and setbacks. Filter by country, theme, or impact, or walk the full chronology era by era.',
    ],
    links: [
      { href: '/personalities', label: 'Notable LGBTQ+ figures' },
      { href: '/travel', label: 'LGBTQ+ rights by country today' },
      { href: '/news', label: 'Current LGBTQ+ news' },
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
      { href: '/tags', label: 'Knowledge & guides' },
      { href: '/about', label: 'Editorial standards' },
    ],
  },

  // The previous copy claimed "Every listing is checked for queer ownership …
  // no rainbow-washing" against a catalogue where 24 of 2,583 brands (0.93%)
  // carry ownership_tags. What the ingestion pipeline actually verifies is
  // RELEVANCE (the marketplace-relevance LLM gate), not ownership — so that is
  // what this says. Ownership is a per-brand label we can defend, not a claim
  // over the whole shelf.
  '/marketplace': {
    h1: 'LGBTQ+ marketplace',
    paragraphs: [
      'Books, apparel, art, home goods, beauty and music for and about the LGBTQ+ community. Every listing is screened for relevance to queer life before it appears.',
      // Second half absorbed from the deleted '/shop' body when the two pages
      // merged: "collected on their own shelf, with the count stated plainly"
      // and the explicit statement that most brands carry nothing either way
      // are the honest-coverage sentences that make the labelled set defensible.
      'Brands we have verified as queer-owned carry an explicit label and are collected on their own shelf, with the count stated plainly; most brands carry no ownership information either way, so we do not claim it for them. Where a brand has a direct shop, we link to it. Where we earn affiliate revenue, we say so on the page; that revenue keeps Queer Guide free.',
    ],
    links: [
      // /marketplace/categories was reachable to crawlers only through the old
      // '/shop' body. Dropping that body without this line would have removed
      // the sole internal link to the category index.
      { href: '/marketplace/categories', label: 'Shop by category' },
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

  // Intent Router pages. Their `links` point DOWNWARD into the canonical browse
  // and detail routes: these are hubs that pass authority to the pages carrying
  // the rankings, never competitors for the same queries.
  '/going-out': {
    h1: 'Going out — LGBTQ+ bars, clubs and nightlife',
    paragraphs: [
      'Where to go out, wherever you are: queer bars, clubs, cafés, saunas and the spaces in between, listed by the community rather than by whoever paid to be there.',
      'We lead with places rather than a calendar, because event listings depend on organisers telling us and our coverage is uneven. Where something is on, we show it and say which time window it came from — an empty week means we have no record, not that nothing is happening.',
    ],
    links: [
      { href: '/venues', label: 'Browse every venue' },
      { href: '/events', label: 'All upcoming events' },
      { href: '/map', label: 'See it on the map' },
      { href: '/cities', label: 'Nightlife by city' },
    ],
  },

  '/rights': {
    h1: 'LGBTQ+ rights and safety, country by country',
    paragraphs: [
      'The legal position for LGBTQ+ people in all 250 countries and territories: whether same-sex acts are criminalised, whether the penalty can be death, whether partnerships are recognised, and a composite equality score.',
      'This is the most completely covered data on Queer Guide — every country has a recorded criminalisation status. Where a country has no equality score we say "not scored" rather than inventing a default.',
      'We can tell you what the law says. We cannot tell you what it means for your particular situation, and this is not legal advice. If you need help now, the crisis lines are one click away.',
    ],
    links: [
      { href: '/travel', label: 'Plan safer queer travel' },
      { href: '/support', label: 'Find support organizations' },
      { href: '/help', label: 'Crisis hotlines' },
      { href: '/news', label: 'Rights news' },
    ],
  },

  // Paired with the '/rights/sources' entry in STATIC_ROUTE_META. Both are
  // required: _middleware.ts gates the crawler body on `indexable` AND on a
  // body entry existing, so META alone yields an indexable page with no
  // content for a bot to read.
  '/rights/sources': {
    h1: 'Where this data comes from',
    paragraphs: [
      'Every legal status on Queer Guide — criminalisation, partnership recognition, anti-discrimination protection, gender recognition, conversion therapy and intersex bodily integrity — comes from the ILGA World Database, re-imported nightly.',
      'The equality score is a 0–100 composite we compute from that record. It opens at 50 and adds points per recorded right, which means a country we hold almost nothing about lands mid-scale rather than reading as unknown. A middling score can mean middling rights or thin data, and the number cannot tell you which.',
      'It is national, so where rights vary by state or province a single figure averages that away. It records statutes, not enforcement. And several facts that matter most to trans travellers — facility access, how identity documents are treated at borders, access to gender-affirming healthcare — are not in this dataset at all. It is not a safety rating.',
    ],
    links: [
      { href: '/rights', label: 'Rights by country' },
      { href: '/travel', label: 'Plan safer queer travel' },
      { href: '/help', label: 'Crisis hotlines' },
    ],
  },

  // Paired with '/rights/trans' in STATIC_ROUTE_META, per the note above.
  '/rights/trans': {
    h1: 'Trans rights and safety',
    paragraphs: [
      'Whether a country will change your gender marker, and what it makes you give up first. A country can permit a document change and still require surgery, a psychiatric diagnosis or a divorce, so those are counted separately here rather than collapsed into a single "recognition" yes or no.',
      'Alongside the law we show TGEU’s Trans Murder Monitoring: aggregate counts of documented killings of trans and gender-diverse people since 2008. These counts are never folded into a safety score. They depend on local reporting and trans-led organisations that do not exist everywhere, so a low number means little was recorded, not that a place is safe.',
      'Our legal source does not record facility access, how identity documents are treated at borders, or access to gender-affirming healthcare. Those are often what decides how a journey actually goes, and we say so rather than letting a clean-looking verdict imply otherwise.',
    ],
    links: [
      { href: '/rights', label: 'All LGBTQ+ rights by country' },
      { href: '/rights/sources', label: 'Where this data comes from' },
      { href: '/travel', label: 'Plan safer queer travel' },
      { href: '/help', label: 'Crisis hotlines' },
    ],
  },

  // Tracks the page, which leads with places rather than a member grid. The
  // previous body promised friends/dates/travel-buddies first; the page now
  // opens on community spaces, groups and events, and a crawler body that
  // describes a different page than the one a visitor lands on is the exact
  // divergence this module exists to prevent.
  '/people': {
    h1: 'Meet people',
    paragraphs: [
      'Where queer people actually gather: community centres and queer neighbourhoods, the groups you can join, what is on nearby, and the bars and cafes people are regulars at.',
      'Member profiles sit alongside all of that rather than in front of it. Everyone listed chose to be, profiles are shown to signed-in members only, and dating is a separate opt-in deck behind its own age gate.',
    ],
    links: [
      { href: '/community/groups', label: 'Groups to join' },
      { href: '/community/feed', label: 'What the community is posting' },
      { href: '/community/members', label: 'Browse members' },
      { href: '/going-out', label: 'Where people are going tonight' },
    ],
  },

  '/support': {
    h1: 'Find LGBTQ+ support near you',
    paragraphs: [
      'Support organizations, advocacy groups and community services for LGBTQ+ people, listed by country with direct links to the people who actually run them.',
      'We list around 2,510 organizations across 76 countries. That is nowhere near everywhere — if a group you trust is missing, tell us and we will add it. An empty result means we have no record, not that no help exists.',
    ],
    links: [
      { href: '/help', label: 'Crisis hotlines by country' },
      { href: '/organizations', label: 'Every organization' },
      { href: '/rights', label: 'Know the law where you are' },
    ],
  },

  // No '/shop' body: it 301s to /marketplace, so no crawler can reach it — the
  // same dead-copy bug as '/resources' below. Its verified-brands sentences were
  // folded into '/marketplace' above rather than deleted, and its unique
  // /marketplace/categories link moved there too.

  // Keyed '/resources' until 2026-08 — same dead-copy bug as '/help-hotlines'
  // below: public/_redirects 301s /resources to /tags, so no crawler could
  // reach this body and the canonical tag glossary served the generic fallback.
  // Found by routeMeta.contract.test.ts, not by hand.
  '/tags': {
    h1: 'Queer Knowledge Hub — guides, references, and reading lists',
    paragraphs: [
      'A growing library of practical and historical resources for queer people. Coming-out guides, healthcare references, legal explainers by jurisdiction, glossaries, reading lists, archive pointers, and crisis resources.',
      "Written and reviewed by queer people. Where we link out, we say what we trust the source for and where its limits are. Where we don't have an answer, we say so.",
    ],
    links: [
      { href: '/help', label: 'Crisis hotlines' },
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
      { href: '/tags', label: 'Knowledge hub' },
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
      'Queer Guide exists because the LGBTQ+ community deserves a resource that is queer-owned, ad-free, tracker-free, and built to last. We are independent — not venture-backed, not advertising-driven, not for sale.',
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
      { href: '/tags', label: 'Reference material' },
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

  // Keyed '/help-hotlines' until 2026-08, which no crawler could ever reach:
  // public/_redirects 301s that path to /help at the edge, and there was no
  // '/help' key — so the canonical crisis page served the generic fallback body
  // while this hand-written copy sat dead. buildNoscriptHtml still returns null
  // for /help (crisis routes keep the default hotline <noscript>); this entry
  // feeds buildBodyHtml, the crawler's first-pass body.
  '/help': {
    h1: 'LGBTQ+ help hotlines and crisis support',
    paragraphs: [
      'Free, confidential hotlines and crisis lines for LGBTQ+ people, organized by country. If you are in immediate danger, call your local emergency number first — these lines are for support, not emergency dispatch.',
      'Lines we list have been verified for current operation and queer-affirming intake. If you find a number that is no longer working or that does not feel safe, please tell us.',
    ],
    links: [
      { href: '/tags', label: 'Other support resources' },
      { href: '/feedback', label: 'Report an outdated number' },
    ],
  },
};

const FALLBACK_PARAGRAPH_FOR = (description: string) =>
  `${description} This page is part of Queer Guide, the independent, community-led, ad-free guide to LGBTQ+ life worldwide.`;

/**
 * Per-route <noscript> fallback (P3.3). Returns content that replaces the
 * global default (crisis-hotline block) in index.html. Crisis routes keep
 * the default so the fallback stays useful for users who arrive without
 * JS — `null` signals "leave alone".
 */
export function buildNoscriptHtml(pathname: string): string | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/help-hotlines' || clean.startsWith('/help')) return null;
  if (clean.startsWith('/safety') || clean.startsWith('/report-')) return null;

  const entry = STATIC_ROUTE_BODY[clean];
  if (!entry) return null;

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const intro = entry.paragraphs[0] ?? '';
  const links = (entry.links ?? COMMON_FOOTER_LINKS).slice(0, 5);
  const linksHtml = links
    .map((l) => `<li><a href="${escape(l.href)}">${escape(l.label)}</a></li>`)
    .join('');

  return `<div style="max-width:640px;margin:2rem auto;padding:1rem;font-family:system-ui,sans-serif;border:1px solid currentColor;border-radius:8px">
  <h1 style="margin:0 0 .5rem;font-size:1.25rem">${escape(entry.h1)}</h1>
  <p style="margin:0 0 .75rem">${escape(intro)}</p>
  <ul style="margin:0;padding-left:1.25rem;line-height:1.7">${linksHtml}</ul>
  <p style="margin-top:1rem">Enable JavaScript to see the full interactive page. For crisis support, see <a href="/help">help hotlines</a>.</p>
</div>`;
}

export function buildBodyHtml(
  pathname: string,
  fallback: { title: string; description: string },
): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const entry = STATIC_ROUTE_BODY[clean];

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let h1: string;
  let paragraphs: string[];
  let links: { href: string; label: string }[];

  if (entry) {
    h1 = entry.h1;
    paragraphs = entry.paragraphs;
    links = entry.links ?? COMMON_FOOTER_LINKS;
  } else {
    h1 =
      fallback.title
        .replace(/\s*\|\s*Queer Guide.*$/, '')
        .replace(/\s*—.*$/, '')
        .trim() || fallback.title;
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
