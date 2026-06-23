/**
 * Standalone landing pages served directly by the Pages Function (bypassing
 * the SPA shell entirely). Used for URL spaces that don't have SPA routes:
 *
 *   /spaces/:tag       — identity-filtered venue lists
 *   /pride/:year       — global Pride hub for a given year
 *   /pride/:year/:city — Pride events in a specific city
 *
 * These responses are full HTML documents — no JS, no SPA hydration. That
 * avoids the cloaking risk of having Googlebot see content that the SPA
 * would render as 404 for human users. Every link on these pages is a
 * regular <a href> to a real SPA route.
 */
import { fetchRows, type Env } from './sitemap';
import { SITE_ORIGIN, DEFAULT_OG_IMAGE, DEFAULT_LOCALE, localizedUrl } from './routeMeta';
import { LOCALISED_LOCALES } from './localisedLocales';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeJsonLd = (s: string) =>
  s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const renderLd = (obj: unknown) =>
  `<script type="application/ld+json">${escapeJsonLd(JSON.stringify(obj))}</script>`;

// Identity tags are mapped to the venue tag/target_group values that exist
// in the DB. Add new keys here as the editorial scope grows.
const IDENTITY_TAGS: Record<
  string,
  { label: string; description: string; tagFilter: string }
> = {
  'trans-friendly': {
    label: 'trans-friendly',
    description:
      'LGBTQ+ venues that are explicitly welcoming and safe for trans, non-binary, and gender-diverse people.',
    tagFilter: 'trans-friendly',
  },
  lesbian: {
    label: 'lesbian',
    description: 'Lesbian-led, lesbian-focused, and explicitly lesbian-friendly LGBTQ+ venues.',
    tagFilter: 'lesbian',
  },
  'non-binary-friendly': {
    label: 'non-binary friendly',
    description:
      'LGBTQ+ venues that explicitly welcome non-binary and gender-non-conforming people.',
    tagFilter: 'non-binary-friendly',
  },
  'bipoc-led': {
    label: 'BIPOC-led',
    description:
      'LGBTQ+ venues led by Black, Indigenous, and people of color — community spaces founded and run by queer BIPOC.',
    tagFilter: 'bipoc-led',
  },
  sober: {
    label: 'sober',
    description: 'LGBTQ+ venues that center sober and substance-free queer life.',
    tagFilter: 'sober',
  },
};

const PRIDE_YEAR_MIN = 2024;
const PRIDE_YEAR_MAX = 2030;

/**
 * Regional buckets for /pride/:year/region/:slug landing pages. Maps a slug
 * (lowercase, kebab) to a human-readable continent name and the ISO2 country
 * codes that roll up into it. Mirrors the CONTINENT_MAP in
 * src/components/pride/PrideFilterRail.tsx — keep in sync when adding new
 * countries to the seed.
 */
const PRIDE_REGIONS: Record<
  string,
  { name: string; countries: string[] }
> = {
  europe: {
    name: 'Europe',
    countries: [
      'DE', 'GB', 'FR', 'ES', 'NL', 'SE', 'DK', 'NO', 'FI', 'IT', 'PT', 'AT',
      'CH', 'BE', 'CZ', 'PL', 'HU', 'GR', 'IE', 'IS', 'EE', 'LV', 'LT', 'RO',
      'BG', 'SI', 'HR', 'BA', 'RS', 'SK', 'GE', 'TR',
    ],
  },
  americas: {
    name: 'Americas',
    countries: [
      'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'EC', 'UY',
    ],
  },
  asia: {
    name: 'Asia',
    countries: [
      'IL', 'JP', 'TW', 'TH', 'HK', 'KR', 'SG', 'PH', 'VN',
    ],
  },
  oceania: {
    name: 'Oceania',
    countries: ['AU', 'NZ'],
  },
  africa: {
    name: 'Africa',
    countries: ['ZA'],
  },
};

// P1.3 — content-quality gates. Below the threshold the landing still
// renders (so the URL doesn't 404), but emits noindex so Google doesn't
// surface thin pages and the sitemap (sitemap-landings.xml.ts) drops
// them. Auto-promote once the row count crosses the bar.
export const MIN_LANDING_VENUES = 6;
export const MIN_LANDING_EVENTS = 3;

const layoutHtml = ({
  title,
  description,
  canonical,
  ogImage,
  hreflangs,
  jsonLd,
  bodyHtml,
  noindex = false,
  locale = 'en',
}: {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  hreflangs: string;
  jsonLd: string;
  bodyHtml: string;
  noindex?: boolean;
  locale?: string;
}) => `<!DOCTYPE html>
<html lang="${escape(locale)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(canonical)}">
${noindex ? '' : hreflangs}
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Queer Guide">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:image" content="${escape(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@queerguide">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${escape(ogImage)}">
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" href="/icons/icon-48.png">
<style>
:root{--fg:#0a0a0a;--muted:#555;--accent:#b60d3d;--bg:#fff}
@media (prefers-color-scheme:dark){:root{--fg:#f5f5f5;--muted:#aaa;--accent:#ff7386;--bg:#0a0a0a}}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;color:var(--fg);background:var(--bg);line-height:1.55;font-size:17px}
header,main,footer{max-width:780px;margin:0 auto;padding:1.5rem}
header{border-bottom:1px solid color-mix(in srgb,var(--fg) 12%,transparent)}
h1{font-size:2rem;line-height:1.2;margin:0 0 1rem}
h2{font-size:1.25rem;margin:2rem 0 0.75rem}
a{color:var(--accent);text-decoration:none}
a:hover{opacity:.85}
ul{padding-left:1.25rem}
li{margin-bottom:0.4rem}
.muted{color:var(--muted)}
.brand{font-weight:700;color:var(--fg)}
nav.crumbs a{color:var(--muted);font-size:0.9rem}
.card{padding:1rem;margin:0.5rem 0;border-bottom:1px solid color-mix(in srgb,var(--fg) 8%,transparent)}
.card h3{margin:0 0 0.25rem;font-size:1.05rem}
.card .meta{font-size:0.9rem;color:var(--muted)}
footer{font-size:0.9rem;color:var(--muted);margin-top:2rem}
</style>
${jsonLd}
</head>
<body>
<header>
<a class="brand" href="/">Queer Guide</a>
</header>
<main>
${bodyHtml}
</main>
<footer>
<p>This is an editorial landing page on <a href="/">Queer Guide</a>. Browse <a href="/venues">all venues</a>, <a href="/events">events</a>, <a href="/travel">travel guides</a>, or <a href="/news">curated news</a>.</p>
</footer>
</body>
</html>`;

const buildHreflang = (basePath: string): string => {
  // P3.1 — only emit hreflang for locales that are actually translated.
  const links = LOCALISED_LOCALES.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${escape(localizedUrl(l, basePath))}">`,
  );
  links.push(
    `<link rel="alternate" hreflang="x-default" href="${escape(localizedUrl(DEFAULT_LOCALE, basePath))}">`,
  );
  return links.join('\n');
};

// Identity / spaces

async function identityLanding(env: Env, tag: string): Promise<Response | null> {
  const meta = IDENTITY_TAGS[tag];
  if (!meta) return null;

  const venues = await fetchRows(
    env,
    'venues',
    'name,slug,city,country,venue_subtype,foursquare_rating',
    // Safety layer — exclude high-risk-country venues from the prerendered
    // facet landing list/JSON-LD (service-role fetch bypasses RLS).
    `tags=cs.{${meta.tagFilter}}&safety_gated=eq.false&order=foursquare_rating.desc.nullslast`,
    100,
  ).catch(() => []);

  const basePath = `/spaces/${tag}`;
  const canonical = `${SITE_ORIGIN}${basePath}`;
  const title = `${meta.label.charAt(0).toUpperCase() + meta.label.slice(1)} LGBTQ+ venues | Queer Guide`;

  const venuesHtml = venues.length
    ? venues
        .filter((v) => typeof v.slug === 'string')
        .map((v) => {
          const name = escape(String(v.name ?? ''));
          const slug = escape(String(v.slug));
          const city = v.city ? ` · ${escape(String(v.city))}${v.country ? ', ' + escape(String(v.country)) : ''}` : '';
          const subtype = v.venue_subtype ? ` · ${escape(String(v.venue_subtype))}` : '';
          return `<div class="card"><h3><a href="/venues/${slug}">${name}</a></h3><div class="meta">${city}${subtype}</div></div>`;
        })
        .join('\n')
    : '<p class="muted">We are still building this list. Check back soon, or browse <a href="/venues">all venues</a>.</p>';

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description: meta.description,
    numberOfItems: venues.length,
    itemListElement: venues
      .filter((v) => typeof v.slug === 'string')
      .slice(0, 25)
      .map((v, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_ORIGIN}/venues/${v.slug}`,
        name: v.name,
      })),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Queer Guide', item: SITE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: 'Spaces', item: `${SITE_ORIGIN}/venues` },
      { '@type': 'ListItem', position: 3, name: meta.label },
    ],
  };

  // P1.3 — noindex thin landings (fewer than MIN_LANDING_VENUES rows).
  // The URL still resolves so existing inbound links don't break; we
  // just don't promote it to Google. Auto-promotes once the threshold
  // is crossed.
  const noindex = venues.length < MIN_LANDING_VENUES;

  const html = layoutHtml({
    title,
    description: meta.description,
    canonical,
    ogImage: DEFAULT_OG_IMAGE,
    hreflangs: buildHreflang(basePath),
    jsonLd: renderLd(itemList) + '\n' + renderLd(breadcrumb),
    noindex,
    bodyHtml: `<nav class="crumbs"><a href="/">Home</a> · <a href="/venues">Venues</a> · ${escape(meta.label)}</nav>
<h1>${escape(meta.label.charAt(0).toUpperCase() + meta.label.slice(1))} LGBTQ+ venues</h1>
<p>${escape(meta.description)}</p>
<h2>Top venues</h2>
${venuesHtml}
<h2>Explore Queer Guide</h2>
<ul>
  <li><a href="/venues">All LGBTQ+ venues</a></li>
  <li><a href="/events">LGBTQ+ events</a></li>
  <li><a href="/travel">Country safety guide</a></li>
  <li><a href="/help-hotlines">Crisis hotlines</a></li>
</ul>`,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, max-age=120',
      Vary: 'User-Agent',
    },
  });
}

// Pride hubs

function isValidPrideYear(s: string): number | null {
  const n = Number(s);
  if (!Number.isInteger(n) || n < PRIDE_YEAR_MIN || n > PRIDE_YEAR_MAX) return null;
  return n;
}

async function prideYearLanding(env: Env, year: number): Promise<Response> {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  const events = await fetchRows(
    env,
    'events',
    'title,slug,city,country,start_date',
    // Safety layer — never surface high-risk-country events to crawlers.
    `event_type=eq.pride&safety_gated=eq.false&start_date=gte.${start}&start_date=lt.${end}&order=start_date.asc`,
    200,
  ).catch(() => []);

  const basePath = `/pride/${year}`;
  const canonical = `${SITE_ORIGIN}${basePath}`;
  const title = `Pride ${year} — global LGBTQ+ events | Queer Guide`;
  const description = `LGBTQ+ Pride events around the world for ${year}: dates, cities, and trusted local listings curated by Queer Guide.`;

  const byCity = new Map<string, Array<Record<string, unknown>>>();
  for (const e of events) {
    const c = typeof e.city === 'string' ? e.city : 'Other';
    if (!byCity.has(c)) byCity.set(c, []);
    byCity.get(c)!.push(e);
  }

  const cityListHtml = byCity.size
    ? [...byCity.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 50)
        .map(
          ([city, evs]) =>
            `<li><a href="/pride/${year}/${escape(city.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${escape(city)}</a> — ${evs.length} event${evs.length === 1 ? '' : 's'}</li>`,
        )
        .join('\n')
    : '<li class="muted">We have no Pride events on file for this year yet.</li>';

  const eventListHtml = events
    .filter((e) => typeof e.slug === 'string')
    .slice(0, 25)
    .map((e) => {
      const name = escape(String(e.title ?? ''));
      const slug = escape(String(e.slug));
      const date = typeof e.start_date === 'string' ? escape(e.start_date.slice(0, 10)) : '';
      const city = e.city ? ` · ${escape(String(e.city))}` : '';
      return `<div class="card"><h3><a href="/events/${slug}">${name}</a></h3><div class="meta">${date}${city}</div></div>`;
    })
    .join('\n');

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Queer Guide', item: SITE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: 'Pride', item: `${SITE_ORIGIN}/pride/${year}` },
      { '@type': 'ListItem', position: 3, name: String(year) },
    ],
  };

  // P1.3 — Pride year hub is indexable as long as we have at least one
  // event on file for the year (otherwise the page is just the editorial
  // shell with no content).
  const noindex = events.length < MIN_LANDING_EVENTS;

  const html = layoutHtml({
    title,
    description,
    canonical,
    ogImage: DEFAULT_OG_IMAGE,
    hreflangs: buildHreflang(basePath),
    jsonLd: renderLd(breadcrumb),
    noindex,
    bodyHtml: `<nav class="crumbs"><a href="/">Home</a> · <a href="/events">Events</a> · Pride ${year}</nav>
<h1>Pride ${year}</h1>
<p>${escape(description)}</p>
<h2>Pride by city (${byCity.size})</h2>
<ul>
  ${cityListHtml}
</ul>
${events.length ? `<h2>Featured Pride events</h2>\n${eventListHtml}` : ''}
<h2>Explore Queer Guide</h2>
<ul>
  <li><a href="/events">All LGBTQ+ events</a></li>
  <li><a href="/travel">Country safety guide</a></li>
  <li><a href="/places">Cities and queer villages</a></li>
</ul>`,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, max-age=120',
      Vary: 'User-Agent',
    },
  });
}

/**
 * P4.2 — WorldPride host-year hub. /pride/:year/world is reserved for the
 * worldwide WorldPride convergence (2026 = Washington DC, 2027 = Amsterdam,
 * etc). It's an editorial anchor page that pulls all Pride events for the
 * year regardless of host city, so the hub stays useful even before the
 * city pages have content.
 */
async function worldPrideLanding(env: Env, year: number): Promise<Response> {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const events = await fetchRows(
    env,
    'events',
    'title,slug,city,country,start_date',
    // Safety layer — never surface high-risk-country events to crawlers.
    `event_type=eq.pride&safety_gated=eq.false&status=neq.cancelled&start_date=gte.${start}&start_date=lt.${end}&order=start_date.asc`,
    50,
  ).catch(() => []);

  const basePath = `/pride/${year}/world`;
  const canonical = `${SITE_ORIGIN}${basePath}`;
  const title = `WorldPride ${year} — global hub | Queer Guide`;
  const description = `WorldPride ${year} — the worldwide LGBTQ+ Pride convergence. Dates, host city, and curated global Pride events on Queer Guide.`;

  const eventsHtml = events.length
    ? events
        .filter((e) => typeof e.slug === 'string')
        .slice(0, 25)
        .map((e) => {
          const name = escape(String(e.title ?? ''));
          const slug = escape(String(e.slug));
          const date = typeof e.start_date === 'string' ? escape(e.start_date.slice(0, 10)) : '';
          const city = e.city ? ` · ${escape(String(e.city))}` : '';
          return `<div class="card"><h3><a href="/events/${slug}">${name}</a></h3><div class="meta">${date}${city}</div></div>`;
        })
        .join('\n')
    : '<p class="muted">Detailed event listings will appear as they are confirmed.</p>';

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Queer Guide', item: SITE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: `Pride ${year}`, item: `${SITE_ORIGIN}/pride/${year}` },
      { '@type': 'ListItem', position: 3, name: 'WorldPride' },
    ],
  };

  const html = layoutHtml({
    title,
    description,
    canonical,
    ogImage: DEFAULT_OG_IMAGE,
    hreflangs: buildHreflang(basePath),
    jsonLd: renderLd(breadcrumb),
    // The hub stays indexable even when the event list is light — it's
    // editorial anchor copy, not a thin listing.
    noindex: false,
    bodyHtml: `<nav class="crumbs"><a href="/">Home</a> · <a href="/pride/${year}">Pride ${year}</a> · WorldPride</nav>
<h1>WorldPride ${year}</h1>
<p>${escape(description)}</p>
<h2>Featured global Pride events</h2>
${eventsHtml}
<h2>Plan your trip</h2>
<ul>
  <li><a href="/travel">Country safety guide</a></li>
  <li><a href="/hotels">LGBTQ+ friendly hotels</a></li>
  <li><a href="/pride/${year}">All Pride events in ${year}</a></li>
</ul>`,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, max-age=120',
      Vary: 'User-Agent',
    },
  });
}

async function prideCityLanding(
  env: Env,
  year: number,
  citySlug: string,
): Promise<Response | null> {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  // citySlug here is a slug-like string ("berlin", "san-francisco"). The
  // events table stores city as a free-text value, so we look it up via the
  // cities table to get the canonical name and id.
  const cityRows = await fetchRows(
    env,
    'cities',
    'id,name,slug',
    `slug=eq.${encodeURIComponent(citySlug)}`,
    1,
  ).catch(() => []);
  const cityRow = cityRows[0];
  if (!cityRow) return null;
  const cityId = typeof cityRow.id === 'string' ? cityRow.id : null;
  const cityName = typeof cityRow.name === 'string' ? cityRow.name : citySlug;
  if (!cityId) return null;

  const events = await fetchRows(
    env,
    'events',
    'title,slug,city,country,start_date,end_date,address',
    // Safety layer — never surface high-risk-country events to crawlers.
    `event_type=eq.pride&safety_gated=eq.false&city_id=eq.${cityId}&start_date=gte.${start}&start_date=lt.${end}&order=start_date.asc`,
    200,
  ).catch(() => []);

  const basePath = `/pride/${year}/${citySlug}`;
  const canonical = `${SITE_ORIGIN}${basePath}`;
  const title = `Pride ${year} in ${cityName} | Queer Guide`;
  const description = `Pride ${year} events, dates, and venues in ${cityName} — curated LGBTQ+ Pride guide on Queer Guide.`;

  const eventListHtml = events.length
    ? events
        .filter((e) => typeof e.slug === 'string')
        .map((e) => {
          const name = escape(String(e.title ?? ''));
          const slug = escape(String(e.slug));
          const date = typeof e.start_date === 'string' ? escape(e.start_date.slice(0, 10)) : '';
          const addr = e.address ? ` · ${escape(String(e.address))}` : '';
          return `<div class="card"><h3><a href="/events/${slug}">${name}</a></h3><div class="meta">${date}${addr}</div></div>`;
        })
        .join('\n')
    : `<p class="muted">No Pride events on file for ${escape(cityName)} in ${year} yet.</p>`;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Queer Guide', item: SITE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: `Pride ${year}`, item: `${SITE_ORIGIN}/pride/${year}` },
      { '@type': 'ListItem', position: 3, name: cityName },
    ],
  };

  // P1.3 — pride city pages need at least one event listed before they
  // earn an index slot. Below the threshold the URL still resolves but
  // emits noindex.
  const noindex = events.length < MIN_LANDING_EVENTS;

  const html = layoutHtml({
    title,
    description,
    canonical,
    ogImage: DEFAULT_OG_IMAGE,
    hreflangs: buildHreflang(basePath),
    jsonLd: renderLd(breadcrumb),
    noindex,
    bodyHtml: `<nav class="crumbs"><a href="/">Home</a> · <a href="/pride/${year}">Pride ${year}</a> · ${escape(cityName)}</nav>
<h1>Pride ${year} in ${escape(cityName)}</h1>
<p>${escape(description)}</p>
${eventListHtml}
<h2>More about ${escape(cityName)}</h2>
<ul>
  <li><a href="/city/${escape(citySlug)}">LGBTQ+ guide to ${escape(cityName)}</a></li>
  <li><a href="/pride/${year}">Pride ${year} worldwide</a></li>
</ul>`,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, max-age=120',
      Vary: 'User-Agent',
    },
  });
}

/**
 * /pride/:year/region/:slug — continental hub. Bundles every pride that year
 * whose country ISO2 sits in the region's bucket. Falls back to noindex
 * (but still renders) when below MIN_LANDING_EVENTS.
 */
async function prideRegionLanding(
  env: Env,
  year: number,
  regionSlug: string,
): Promise<Response | null> {
  const region = PRIDE_REGIONS[regionSlug];
  if (!region) return null;

  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const countryFilter = region.countries.map((c) => `"${c}"`).join(',');

  const events = await fetchRows(
    env,
    'events',
    'title,slug,city,country,start_date,end_date,is_featured',
    // Safety layer — never surface high-risk-country events to crawlers.
    `event_type=eq.pride&safety_gated=eq.false&country=in.(${countryFilter})&start_date=gte.${start}&start_date=lt.${end}&order=start_date.asc`,
    300,
  ).catch(() => []);

  const basePath = `/pride/${year}/region/${regionSlug}`;
  const canonical = `${SITE_ORIGIN}${basePath}`;
  const title = `Pride ${year} in ${region.name} | Queer Guide`;
  const description = `Every LGBTQ+ Pride event in ${region.name} for ${year} — dates, cities, and links to local listings, curated by Queer Guide.`;

  const byCountry = new Map<string, Array<Record<string, unknown>>>();
  for (const e of events) {
    const c = typeof e.country === 'string' ? e.country : 'Other';
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c)!.push(e);
  }

  const countryListHtml = byCountry.size
    ? [...byCountry.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(
          ([cc, evs]) =>
            `<li><strong>${escape(cc)}</strong> — ${evs.length} event${evs.length === 1 ? '' : 's'}</li>`,
        )
        .join('\n')
    : '<li class="muted">We have no Pride events on file for this region yet.</li>';

  const featuredHtml = events
    .filter((e) => e.is_featured && typeof e.slug === 'string')
    .slice(0, 30)
    .map((e) => {
      const name = escape(String(e.title ?? ''));
      const slug = escape(String(e.slug));
      const date = typeof e.start_date === 'string' ? escape(e.start_date.slice(0, 10)) : '';
      const city = e.city ? ` · ${escape(String(e.city))}` : '';
      return `<div class="card"><h3><a href="/events/${slug}">${name}</a></h3><div class="meta">${date}${city}</div></div>`;
    })
    .join('\n');

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Queer Guide', item: SITE_ORIGIN },
      { '@type': 'ListItem', position: 2, name: `Pride ${year}`, item: `${SITE_ORIGIN}/pride/${year}` },
      { '@type': 'ListItem', position: 3, name: region.name },
    ],
  };

  const noindex = events.length < MIN_LANDING_EVENTS;

  const html = layoutHtml({
    title,
    description,
    canonical,
    ogImage: DEFAULT_OG_IMAGE,
    hreflangs: buildHreflang(basePath),
    jsonLd: renderLd(breadcrumb),
    noindex,
    bodyHtml: `<nav class="crumbs"><a href="/">Home</a> · <a href="/pride/${year}">Pride ${year}</a> · ${escape(region.name)}</nav>
<h1>Pride ${year} in ${escape(region.name)}</h1>
<p>${escape(description)}</p>
<p><strong>${events.length}</strong> pride${events.length === 1 ? '' : 's'} across <strong>${byCountry.size}</strong> ${byCountry.size === 1 ? 'country' : 'countries'}.</p>
<h2>By country</h2>
<ul>
  ${countryListHtml}
</ul>
${featuredHtml ? `<h2>Featured prides</h2>\n${featuredHtml}` : ''}
<h2>Explore Queer Guide</h2>
<ul>
  <li><a href="/pride/${year}">All Pride events in ${year}</a></li>
  <li><a href="/pride/${year}/world">WorldPride ${year}</a></li>
  <li><a href="/travel">Country safety guide</a></li>
</ul>`,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, max-age=120',
      Vary: 'User-Agent',
    },
  });
}

// Dispatch

export async function resolveLandingRoute(
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (!env.SUPABASE_URL || (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    return null;
  }

  const spacesMatch = pathname.match(/^\/spaces\/([^/?#]+)\/?$/);
  if (spacesMatch) {
    return identityLanding(env, decodeURIComponent(spacesMatch[1]));
  }

  // /pride/:year/region/:slug must match BEFORE /pride/:year/:city because
  // "region" would otherwise look like a city slug.
  const prideRegionMatch = pathname.match(/^\/pride\/(\d+)\/region\/([^/?#]+)\/?$/);
  if (prideRegionMatch) {
    const year = isValidPrideYear(prideRegionMatch[1]);
    if (!year) return null;
    const slug = decodeURIComponent(prideRegionMatch[2]).toLowerCase();
    return prideRegionLanding(env, year, slug);
  }

  const prideCityMatch = pathname.match(/^\/pride\/(\d+)\/([^/?#]+)\/?$/);
  if (prideCityMatch) {
    const year = isValidPrideYear(prideCityMatch[1]);
    if (!year) return null;
    const slug = decodeURIComponent(prideCityMatch[2]);
    // P4.2 — reserved /pride/:year/world WorldPride hub.
    if (slug === 'world') return worldPrideLanding(env, year);
    return prideCityLanding(env, year, slug);
  }

  const prideYearMatch = pathname.match(/^\/pride\/(\d+)\/?$/);
  if (prideYearMatch) {
    const year = isValidPrideYear(prideYearMatch[1]);
    if (!year) return null;
    return prideYearLanding(env, year);
  }

  return null;
}

export const IDENTITY_SLUGS = Object.keys(IDENTITY_TAGS);
export const PRIDE_YEARS = Array.from({ length: PRIDE_YEAR_MAX - PRIDE_YEAR_MIN + 1 }, (_, i) => PRIDE_YEAR_MIN + i);
export const PRIDE_REGION_SLUGS = Object.keys(PRIDE_REGIONS);
