/**
 * Detail-route SSR for crawlers. Pattern-matches the pathname to a content
 * type, fetches the matching row from Supabase, and produces:
 *   - per-route <title> + <meta name="description">
 *   - <h1> + body content for #root injection (bot UA only)
 *   - schema.org JSON-LD for the head
 *
 * If the row isn't found or Supabase isn't configured, returns null and the
 * middleware falls back to the slug-derived static fallback in routeMeta.ts.
 */
import { fetchRows, type Env } from './sitemap';
import { SITE_ORIGIN, DEFAULT_OG_IMAGE, type RouteMeta } from './routeMeta';

export type DetailResult = {
  meta: RouteMeta;
  body: string;
  jsonLd: string;
};

const TITLE_SUFFIX = ' | Queer Guide';
const MAX_TITLE = 60;
const MAX_DESC = 155;

const truncate = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeJsonLd = (s: string) =>
  s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const renderLd = (obj: unknown) =>
  `<script type="application/ld+json">${escapeJsonLd(JSON.stringify(obj))}</script>`;

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
const collapseWs = (s: string) => s.replace(/\s+/g, ' ').trim();

const stringField = (row: Record<string, unknown>, k: string): string | undefined => {
  const v = row[k];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};
const numField = (row: Record<string, unknown>, k: string): number | undefined => {
  const v = row[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const arrayField = (row: Record<string, unknown>, k: string): unknown[] | undefined => {
  const v = row[k];
  return Array.isArray(v) ? v : undefined;
};

function paragraphsHtml(text: string): string {
  return collapseWs(stripHtml(text))
    .split(/\n{2,}|(?<=[.!?])\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p)}</p>`)
    .join('\n      ');
}

async function fetchOne(env: Env, table: string, slugCol: string, slug: string, select: string) {
  const rows = await fetchRows(env, table, select, `${slugCol}=eq.${encodeURIComponent(slug)}`, 1);
  return rows[0] ?? null;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Venues

async function venueDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'venues',
    'slug',
    slug,
    'name,slug,description,address,city,country,postal_code,latitude,longitude,phone,website,images,category,venue_subtype,foursquare_rating,tripadvisor_rating,tomtom_rating,hours,updated_at',
  );
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const address = stringField(row, 'address');
  const city = stringField(row, 'city');
  const country = stringField(row, 'country');
  const subtype = stringField(row, 'venue_subtype') ?? stringField(row, 'category') ?? 'Venue';

  const meta: RouteMeta = {
    title: truncate(`${name}${city ? ` — ${city}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description ||
        `${name}${city ? ` in ${city}` : ''} — LGBTQ+ ${subtype.toLowerCase()} on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: (arrayField(row, 'images')?.[0] as string) ?? DEFAULT_OG_IMAGE,
  };

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${address || city ? `<p><strong>${escape([address, city, country].filter(Boolean).join(', '))}</strong></p>` : ''}
      ${description ? paragraphsHtml(description) : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/venues">All venues</a></li>
        ${city ? `<li><a href="/places/${escape(slugify(city))}">More in ${escape(city)}</a></li>` : ''}
        <li><a href="/events">Events</a></li>
      </ul>
    </nav>
  </main>`;

  const ratings = [
    numField(row, 'foursquare_rating'),
    numField(row, 'tripadvisor_rating'),
    numField(row, 'tomtom_rating'),
  ].filter((n): n is number => n !== undefined);
  const aggregate = ratings.length
    ? { ratingValue: ratings.reduce((a, b) => a + b, 0) / ratings.length, ratingCount: ratings.length }
    : null;

  const localBusiness: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': mapVenueType(subtype),
    name,
    url: `${SITE_ORIGIN}${pathname}`,
    description: description || undefined,
    address:
      address || city
        ? {
            '@type': 'PostalAddress',
            streetAddress: address,
            addressLocality: city,
            postalCode: stringField(row, 'postal_code'),
            addressCountry: country,
          }
        : undefined,
    geo:
      numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(row, 'latitude'),
            longitude: numField(row, 'longitude'),
          }
        : undefined,
    telephone: stringField(row, 'phone'),
    image: arrayField(row, 'images')?.[0],
    sameAs: stringField(row, 'website') ? [stringField(row, 'website')] : undefined,
    aggregateRating: aggregate
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(aggregate.ratingValue.toFixed(1)),
          ratingCount: aggregate.ratingCount,
        }
      : undefined,
  };

  return { meta, body, jsonLd: renderLd(prune(localBusiness)) };
}

function mapVenueType(subtype: string): string {
  const s = subtype.toLowerCase();
  if (s.includes('bar')) return 'BarOrPub';
  if (s.includes('cafe') || s.includes('café')) return 'CafeOrCoffeeShop';
  if (s.includes('club') || s.includes('night')) return 'NightClub';
  if (s.includes('restaurant')) return 'Restaurant';
  if (s.includes('hotel') || s.includes('hostel') || s.includes('accommodation')) return 'LodgingBusiness';
  if (s.includes('shop') || s.includes('store') || s.includes('boutique')) return 'Store';
  return 'LocalBusiness';
}

// Events

async function eventDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'events',
    'slug',
    slug,
    'title,slug,description,address,city,country,start_date,end_date,latitude,longitude,images,ticket_url,organizer_name,venue_name,price_min,price_max,is_free,event_type,timezone,updated_at',
  );
  if (!row) return null;

  const title = stringField(row, 'title') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const city = stringField(row, 'city');
  const country = stringField(row, 'country');
  const startDate = stringField(row, 'start_date');
  const endDate = stringField(row, 'end_date');

  const meta: RouteMeta = {
    title: truncate(`${title}${city ? ` in ${city}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description ||
        `${title} — LGBTQ+ event${city ? ` in ${city}` : ''}${
          startDate ? ` on ${startDate.slice(0, 10)}` : ''
        } on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: (arrayField(row, 'images')?.[0] as string) ?? DEFAULT_OG_IMAGE,
  };

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(title)}</h1>
      ${startDate ? `<p><strong>When:</strong> <time datetime="${escape(startDate)}">${escape(startDate.slice(0, 10))}</time>${endDate ? ` – <time datetime="${escape(endDate)}">${escape(endDate.slice(0, 10))}</time>` : ''}</p>` : ''}
      ${city ? `<p><strong>Where:</strong> ${escape([stringField(row, 'venue_name'), stringField(row, 'address'), city, country].filter(Boolean).join(', '))}</p>` : ''}
      ${description ? paragraphsHtml(description) : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/events">All events</a></li>
        ${city ? `<li><a href="/places/${escape(slugify(city))}">More in ${escape(city)}</a></li>` : ''}
        <li><a href="/venues">Venues</a></li>
      </ul>
    </nav>
  </main>`;

  const eventLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    description: description || undefined,
    startDate,
    endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: stringField(row, 'venue_name') ?? city ?? 'Unknown',
      address: {
        '@type': 'PostalAddress',
        streetAddress: stringField(row, 'address'),
        addressLocality: city,
        addressCountry: country,
      },
      geo:
        numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
          ? {
              '@type': 'GeoCoordinates',
              latitude: numField(row, 'latitude'),
              longitude: numField(row, 'longitude'),
            }
          : undefined,
    },
    image: arrayField(row, 'images')?.[0],
    url: `${SITE_ORIGIN}${pathname}`,
    organizer: stringField(row, 'organizer_name')
      ? { '@type': 'Organization', name: stringField(row, 'organizer_name') }
      : undefined,
    offers:
      stringField(row, 'ticket_url') || numField(row, 'price_min') !== undefined || row.is_free === true
        ? {
            '@type': 'Offer',
            url: stringField(row, 'ticket_url'),
            price: row.is_free === true ? 0 : numField(row, 'price_min'),
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
          }
        : undefined,
  };

  return { meta, body, jsonLd: renderLd(prune(eventLd)) };
}

// News articles

async function newsDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'news_articles',
    'slug',
    slug,
    'title,slug,excerpt,author,image_url,published_at,url,publisher_name,updated_at',
  );
  if (!row) return null;

  const title = stringField(row, 'title') ?? slug;
  const excerpt = stringField(row, 'excerpt') ?? '';
  const author = stringField(row, 'author');
  const publisher = stringField(row, 'publisher_name');
  const image = stringField(row, 'image_url');

  const meta: RouteMeta = {
    title: truncate(`${title}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(excerpt || `${title} — LGBTQ+ news on Queer Guide.`, MAX_DESC),
    ogImage: image ?? DEFAULT_OG_IMAGE,
  };

  const sourceLink = stringField(row, 'url');
  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(title)}</h1>
      <p>${author ? `<em>By ${escape(author)}</em>` : ''}${author && publisher ? ' · ' : ''}${publisher ? `Published on ${escape(publisher)}` : ''}</p>
      ${excerpt ? `<p>${escape(excerpt)}</p>` : ''}
      ${sourceLink ? `<p><a href="${escape(sourceLink)}" rel="nofollow noopener">Read the full article at ${escape(publisher ?? 'the source')}</a></p>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/news">All news</a></li>
        <li><a href="/blog">Long-form essays</a></li>
        <li><a href="/resources">Knowledge hub</a></li>
      </ul>
    </nav>
  </main>`;

  const articleLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: excerpt || undefined,
    datePublished: stringField(row, 'published_at'),
    dateModified: stringField(row, 'updated_at') ?? stringField(row, 'published_at'),
    author: author ? { '@type': 'Person', name: author } : undefined,
    publisher: publisher
      ? {
          '@type': 'Organization',
          name: publisher,
          logo: {
            '@type': 'ImageObject',
            url: `${SITE_ORIGIN}/icons/icon-192.png`,
          },
        }
      : undefined,
    image: image ? [image] : undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_ORIGIN}${pathname}` },
    url: `${SITE_ORIGIN}${pathname}`,
    isBasedOn: sourceLink,
  };

  return { meta, body, jsonLd: renderLd(prune(articleLd)) };
}

// Personalities

async function personalityDetail(
  env: Env,
  slug: string,
  pathname: string,
): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'personalities',
    'slug',
    slug,
    'name,slug,bio,description,image_url,profession,lgbti_connection,lgbti_details,birth_date,death_date,birth_place,nationality,pronouns,website_url,updated_at,is_living',
  );
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const bio = stringField(row, 'bio') ?? '';
  const description = stringField(row, 'description') ?? '';
  const profession = stringField(row, 'profession');
  const image = stringField(row, 'image_url');
  const birthDate = stringField(row, 'birth_date');
  const deathDate = stringField(row, 'death_date');

  const meta: RouteMeta = {
    title: truncate(`${name}${profession ? ` — ${profession}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || bio || `${name} — notable LGBTQ+ figure on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: image ?? DEFAULT_OG_IMAGE,
  };

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${profession ? `<p><strong>${escape(profession)}</strong></p>` : ''}
      ${birthDate || deathDate ? `<p>${birthDate ? escape(birthDate.slice(0, 10)) : '?'} – ${deathDate ? escape(deathDate.slice(0, 10)) : (row.is_living === true ? 'present' : '?')}</p>` : ''}
      ${description ? paragraphsHtml(description) : ''}
      ${bio && bio !== description ? paragraphsHtml(bio) : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/personalities">All personalities</a></li>
        <li><a href="/resources">Knowledge hub</a></li>
      </ul>
    </nav>
  </main>`;

  const personLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    description: description || bio || undefined,
    jobTitle: profession,
    image,
    birthDate,
    deathDate,
    birthPlace: stringField(row, 'birth_place')
      ? { '@type': 'Place', name: stringField(row, 'birth_place') }
      : undefined,
    nationality: stringField(row, 'nationality'),
    sameAs: stringField(row, 'website_url') ? [stringField(row, 'website_url')] : undefined,
    url: `${SITE_ORIGIN}${pathname}`,
  };

  return { meta, body, jsonLd: renderLd(prune(personLd)) };
}

// City — programmatic SEO surface for /city/:slug

async function cityDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const cityRow = await fetchOne(
    env,
    'cities',
    'slug',
    slug,
    'id,name,slug,description,image_url,latitude,longitude,country_id,is_capital,is_major_city,population,lgbt_friendly_rating,updated_at',
  );
  if (!cityRow) return null;

  const name = stringField(cityRow, 'name') ?? slug;
  const description = stringField(cityRow, 'description') ?? '';
  const image = stringField(cityRow, 'image_url');
  const cityId = stringField(cityRow, 'id');

  // Aggregate venues + events for this city. Best-effort — if either fails the
  // page still renders with whatever we have.
  const [venues, events] = await Promise.all([
    cityId
      ? fetchRows(
          env,
          'venues',
          'name,slug,address,category,venue_subtype,foursquare_rating',
          `city_id=eq.${cityId}&order=foursquare_rating.desc.nullslast`,
          10,
        ).catch(() => [])
      : Promise.resolve([]),
    cityId
      ? fetchRows(
          env,
          'events',
          'title,slug,start_date',
          `city_id=eq.${cityId}&start_date=gte.${new Date().toISOString().slice(0, 10)}&order=start_date.asc`,
          10,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  const meta: RouteMeta = {
    title: truncate(`LGBTQ+ guide to ${name}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description ||
        `Queer venues, events, hotels and travel tips for ${name}. ${venues.length} venues, ${events.length} upcoming events on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: image ?? DEFAULT_OG_IMAGE,
  };

  const venuesList = venues
    .filter((v) => stringField(v, 'slug'))
    .map((v) => {
      const vname = escape(stringField(v, 'name') ?? '');
      const vslug = escape(stringField(v, 'slug') ?? '');
      const vsub = stringField(v, 'venue_subtype') ?? stringField(v, 'category');
      return `<li><a href="/venues/${vslug}">${vname}</a>${vsub ? ` — ${escape(vsub)}` : ''}</li>`;
    })
    .join('\n        ');

  const eventsList = events
    .filter((e) => stringField(e, 'slug'))
    .map((e) => {
      const ename = escape(stringField(e, 'title') ?? '');
      const eslug = escape(stringField(e, 'slug') ?? '');
      const edate = stringField(e, 'start_date');
      return `<li><a href="/events/${eslug}">${ename}</a>${edate ? ` — <time datetime="${escape(edate)}">${escape(edate.slice(0, 10))}</time>` : ''}</li>`;
    })
    .join('\n        ');

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>LGBTQ+ guide to ${escape(name)}</h1>
      ${description ? paragraphsHtml(description) : `<p>${escape(name)} is part of the global queer life Queer Guide tracks. Below are the venues, events and travel tips we have on file for ${escape(name)}.</p>`}
      ${venues.length ? `<section><h2>Top LGBTQ+ venues in ${escape(name)}</h2><ul>\n        ${venuesList}\n      </ul></section>` : ''}
      ${events.length ? `<section><h2>Upcoming LGBTQ+ events in ${escape(name)}</h2><ul>\n        ${eventsList}\n      </ul></section>` : ''}
      <section><h2>Plan your trip</h2><p>Check the <a href="/travel">country safety guide</a> before you go, and browse <a href="/hotels">queer-friendly hotels</a> and <a href="/villages">queer villages</a> for a place to stay.</p></section>
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/places">All places</a></li>
        <li><a href="/venues">All venues</a></li>
        <li><a href="/events">All events</a></li>
        <li><a href="/travel">Travel</a></li>
      </ul>
    </nav>
  </main>`;

  const placeLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name,
    description: description || `LGBTQ+ guide to ${name} on Queer Guide.`,
    url: `${SITE_ORIGIN}${pathname}`,
    image,
    geo:
      numField(cityRow, 'latitude') !== undefined && numField(cityRow, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(cityRow, 'latitude'),
            longitude: numField(cityRow, 'longitude'),
          }
        : undefined,
  };

  const itemList: Record<string, unknown> | null = venues.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `LGBTQ+ venues in ${name}`,
        itemListElement: venues
          .filter((v) => stringField(v, 'slug'))
          .map((v, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_ORIGIN}/venues/${stringField(v, 'slug')}`,
            name: stringField(v, 'name'),
          })),
      }
    : null;

  const jsonLd =
    renderLd(prune(placeLd)) + (itemList ? '\n' + renderLd(prune(itemList)) : '');

  return { meta, body, jsonLd };
}

// Country — /country/:slug

async function countryDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'countries',
    'slug',
    slug,
    'id,name,slug,code,description,image_url,capital,latitude,longitude,equality_score,lgbt_legal_status,lgbt_rights_status,lgbti_same_sex_unions,population,updated_at',
  );
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const image = stringField(row, 'image_url');
  const legal = stringField(row, 'lgbt_legal_status');
  const unions = stringField(row, 'lgbti_same_sex_unions');
  const capital = stringField(row, 'capital');

  const meta: RouteMeta = {
    title: truncate(`LGBTQ+ rights & travel — ${name}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description ||
        `LGBTQ+ legal status, safety, venues and travel guide for ${name}. ${legal ? `Legal status: ${legal}.` : ''}`,
      MAX_DESC,
    ),
    ogImage: image ?? DEFAULT_OG_IMAGE,
  };

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>LGBTQ+ guide to ${escape(name)}</h1>
      ${capital ? `<p><strong>Capital:</strong> ${escape(capital)}</p>` : ''}
      ${legal ? `<p><strong>LGBTQ+ legal status:</strong> ${escape(legal)}</p>` : ''}
      ${unions ? `<p><strong>Same-sex unions:</strong> ${escape(unions)}</p>` : ''}
      ${description ? paragraphsHtml(description) : `<p>Country profile, legal status and travel notes for ${escape(name)}.</p>`}
      <section><h2>Plan your trip</h2><p>Read the <a href="/travel">global travel safety guide</a>, browse <a href="/places">cities and queer villages</a>, and check <a href="/help-hotlines">crisis hotlines</a> before you go.</p></section>
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/places">Places</a></li>
        <li><a href="/travel">Travel</a></li>
        <li><a href="/venues">Venues</a></li>
      </ul>
    </nav>
  </main>`;

  const countryLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Country',
    name,
    identifier: stringField(row, 'code'),
    description: description || undefined,
    image,
    url: `${SITE_ORIGIN}${pathname}`,
  };

  return { meta, body, jsonLd: renderLd(prune(countryLd)) };
}

// Hotels — /hotels/:slug

async function hotelDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'hotels',
    'slug',
    slug,
    'name,slug,description,address,city,country,latitude,longitude,images,hotel_type,star_rating,price_range,amenities,booking_url,phone,website,queer_safety_notes,lgbtq_friendly,updated_at',
  );
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const city = stringField(row, 'city');
  const country = stringField(row, 'country');
  const safetyNotes = stringField(row, 'queer_safety_notes');

  const meta: RouteMeta = {
    title: truncate(`${name}${city ? ` — ${city}` : ''}${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || `LGBTQ+ friendly hotel${city ? ` in ${city}` : ''} on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: (arrayField(row, 'images')?.[0] as string) ?? DEFAULT_OG_IMAGE,
  };

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${city ? `<p><strong>${escape([stringField(row, 'address'), city, country].filter(Boolean).join(', '))}</strong></p>` : ''}
      ${description ? paragraphsHtml(description) : ''}
      ${safetyNotes ? `<section><h2>Queer safety notes</h2>${paragraphsHtml(safetyNotes)}</section>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/hotels">All hotels</a></li>
        ${city ? `<li><a href="/city/${escape(slugify(city))}">More in ${escape(city)}</a></li>` : ''}
        <li><a href="/travel">Travel</a></li>
      </ul>
    </nav>
  </main>`;

  const lodgingLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name,
    description: description || undefined,
    url: `${SITE_ORIGIN}${pathname}`,
    address:
      stringField(row, 'address') || city
        ? {
            '@type': 'PostalAddress',
            streetAddress: stringField(row, 'address'),
            addressLocality: city,
            addressCountry: country,
          }
        : undefined,
    geo:
      numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(row, 'latitude'),
            longitude: numField(row, 'longitude'),
          }
        : undefined,
    image: arrayField(row, 'images')?.[0],
    starRating: numField(row, 'star_rating')
      ? { '@type': 'Rating', ratingValue: numField(row, 'star_rating') }
      : undefined,
    telephone: stringField(row, 'phone'),
    priceRange:
      numField(row, 'price_range') !== undefined ? '$'.repeat(numField(row, 'price_range') as number) : undefined,
    sameAs: stringField(row, 'website') ? [stringField(row, 'website')] : undefined,
  };

  return { meta, body, jsonLd: renderLd(prune(lodgingLd)) };
}

// Queer villages — /villages/:slug

async function villageDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'queer_villages',
    'slug',
    slug,
    'name,slug,description,history,latitude,longitude,images,image_url,notable_landmarks,website,updated_at',
  );
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const description = stringField(row, 'description') ?? '';
  const history = stringField(row, 'history') ?? '';
  const landmarks = arrayField(row, 'notable_landmarks') ?? [];
  const image = stringField(row, 'image_url') ?? (arrayField(row, 'images')?.[0] as string | undefined);

  const meta: RouteMeta = {
    title: truncate(`${name} — Queer village${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || `${name} — historic queer neighborhood and travel destination on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: image ?? DEFAULT_OG_IMAGE,
  };

  const landmarksList = landmarks
    .filter((l): l is string => typeof l === 'string' && l.length > 0)
    .map((l) => `<li>${escape(l)}</li>`)
    .join('\n        ');

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${description ? paragraphsHtml(description) : ''}
      ${history ? `<section><h2>History</h2>${paragraphsHtml(history)}</section>` : ''}
      ${landmarksList ? `<section><h2>Notable landmarks</h2><ul>\n        ${landmarksList}\n      </ul></section>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/places">All places</a></li>
        <li><a href="/travel">Travel</a></li>
      </ul>
    </nav>
  </main>`;

  const placeLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name,
    description: description || undefined,
    url: `${SITE_ORIGIN}${pathname}`,
    image,
    geo:
      numField(row, 'latitude') !== undefined && numField(row, 'longitude') !== undefined
        ? {
            '@type': 'GeoCoordinates',
            latitude: numField(row, 'latitude'),
            longitude: numField(row, 'longitude'),
          }
        : undefined,
  };

  return { meta, body, jsonLd: renderLd(prune(placeLd)) };
}

// Tags — /tags/:slug

async function tagDetail(env: Env, slug: string, pathname: string): Promise<DetailResult | null> {
  const row = await fetchOne(
    env,
    'unified_tags',
    'slug',
    slug,
    'name,slug,description,short_description,long_description,image_url,category,wikipedia_url,wikidata_id,updated_at',
  );
  if (!row) return null;

  const name = stringField(row, 'name') ?? slug;
  const description =
    stringField(row, 'long_description') ??
    stringField(row, 'description') ??
    stringField(row, 'short_description') ??
    '';
  const image = stringField(row, 'image_url');
  const category = stringField(row, 'category');

  const meta: RouteMeta = {
    title: truncate(`${name} — Topic${TITLE_SUFFIX}`, MAX_TITLE),
    description: truncate(
      description || `Articles, venues and events about ${name} on Queer Guide.`,
      MAX_DESC,
    ),
    ogImage: image ?? DEFAULT_OG_IMAGE,
  };

  const body = `<main data-prerendered="bot-ua">
    <article>
      <h1>${escape(name)}</h1>
      ${category ? `<p><strong>Category:</strong> ${escape(category)}</p>` : ''}
      ${description ? paragraphsHtml(description) : `<p>Browse content tagged ${escape(name)} on Queer Guide.</p>`}
      ${stringField(row, 'wikipedia_url') ? `<p><a href="${escape(stringField(row, 'wikipedia_url')!)}" rel="noopener">Read more on Wikipedia</a></p>` : ''}
    </article>
    <nav aria-label="Site sections">
      <ul>
        <li><a href="/resources">Knowledge hub</a></li>
        <li><a href="/news">Related news</a></li>
        <li><a href="/blog">Long-form essays</a></li>
      </ul>
    </nav>
  </main>`;

  const thingLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name,
    description: description || undefined,
    image,
    url: `${SITE_ORIGIN}${pathname}`,
    sameAs: stringField(row, 'wikipedia_url') ? [stringField(row, 'wikipedia_url')] : undefined,
    identifier: stringField(row, 'wikidata_id'),
  };

  return { meta, body, jsonLd: renderLd(prune(thingLd)) };
}

// Dispatch

const DETAIL_ROUTE_RE =
  /^\/(venues?|events?|news|personalities|personality|city|country|hotels?|villages?|tags?)\/([^/?#]+)\/?$/;

/**
 * True if the URL matches a detail-route pattern (regardless of whether the
 * row actually exists). The middleware uses this to decide whether a missing
 * detail row should produce a 404 vs. fall through to the SPA.
 */
export function isDetailPath(pathname: string): boolean {
  return DETAIL_ROUTE_RE.test(pathname);
}

export async function resolveDetailRoute(
  env: Env,
  pathname: string,
): Promise<DetailResult | null> {
  if (!env.SUPABASE_URL || (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    return null;
  }
  const m = pathname.match(DETAIL_ROUTE_RE);
  if (!m) return null;
  const [, kindRaw, rawSlug] = m;
  const slug = decodeURIComponent(rawSlug);
  try {
    if (kindRaw.startsWith('venue')) return await venueDetail(env, slug, pathname);
    if (kindRaw.startsWith('event')) return await eventDetail(env, slug, pathname);
    if (kindRaw === 'news') return await newsDetail(env, slug, pathname);
    if (kindRaw.startsWith('personalit')) return await personalityDetail(env, slug, pathname);
    if (kindRaw === 'city') return await cityDetail(env, slug, pathname);
    if (kindRaw === 'country') return await countryDetail(env, slug, pathname);
    if (kindRaw.startsWith('hotel')) return await hotelDetail(env, slug, pathname);
    if (kindRaw.startsWith('village')) return await villageDetail(env, slug, pathname);
    if (kindRaw.startsWith('tag')) return await tagDetail(env, slug, pathname);
  } catch {
    return null;
  }
  return null;
}

function prune<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = prune(v as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
