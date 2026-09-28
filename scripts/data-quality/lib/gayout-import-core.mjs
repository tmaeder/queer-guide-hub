import { createHash } from 'node:crypto';

export const GAYOUT_SECTIONS = new Set([
  'bars',
  'restaurants',
  'organizations',
  'saunas',
  'cruising',
  'shops',
  'gay-heritage',
  'beaches',
  'entertainment',
  'spas',
  'gyms',
  'hotels',
]);

const CATEGORY_BY_SECTION = {
  bars: 'bar',
  restaurants: 'restaurant',
  organizations: 'community_center',
  saunas: 'sauna',
  cruising: 'cruising',
  shops: 'shop',
  'gay-heritage': 'other',
  beaches: 'outdoor',
  entertainment: 'event-venue',
  spas: 'other',
  gyms: 'gym',
  hotels: 'hotel',
};

export function titleCaseSlug(value) {
  return decodeURIComponent(String(value || ''))
    .replace(/-(\d+)$/, '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function parseVenueUrl(input, lastmod = null) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!/(^|\.)gayout\.com$/i.test(url.hostname)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 5) return null;
  const [regionSlug, countrySlug, citySlug, section, venueSlug] = parts;
  if (!GAYOUT_SECTIONS.has(section) || !venueSlug) return null;

  const pathname = `/${parts.join('/')}`;
  return {
    source_id: pathname,
    url: `https://www.gayout.com${pathname}`,
    lastmod: lastmod || null,
    region_slug: regionSlug,
    country_slug: countrySlug,
    city_slug: citySlug,
    section,
    category: CATEGORY_BY_SECTION[section] || 'other',
    name_fallback: titleCaseSlug(venueSlug),
  };
}

export function parseSitemap(text) {
  const input = String(text || '');
  const rows = [];
  if (/<urlset[\s>]/i.test(input)) {
    for (const match of input.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const block = match[1];
      const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(block)?.[1]?.trim();
      const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(block)?.[1]?.trim() || null;
      if (loc) rows.push(parseVenueUrl(decodeXml(loc), lastmod));
    }
  } else {
    for (const line of input.split(/\r?\n/)) {
      const value = line.trim();
      if (value) rows.push(parseVenueUrl(value));
    }
  }
  const unique = new Map();
  for (const row of rows) if (row && !unique.has(row.source_id)) unique.set(row.source_id, row);
  return [...unique.values()];
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function flattenJsonLd(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out);
  } else if (value && typeof value === 'object') {
    out.push(value);
    if (Array.isArray(value['@graph'])) flattenJsonLd(value['@graph'], out);
  }
  return out;
}

function schemaTypes(value) {
  const types = Array.isArray(value) ? value : [value];
  return types.map(String).filter(Boolean);
}

function finiteCoord(value, min, max) {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

export function parseVenueHtml(html, seed) {
  const objects = [];
  for (const match of String(html || '').matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      flattenJsonLd(JSON.parse(match[1]), objects);
    } catch {
      // One malformed block must not hide another valid schema block.
    }
  }

  const candidates = objects.filter((item) => {
    const types = schemaTypes(item['@type']);
    return item.name && !types.includes('BreadcrumbList') && !types.includes('WebSite');
  });
  const canonicalPath = seed?.source_id;
  const item =
    candidates.find((candidate) => {
      try {
        return canonicalPath && new URL(candidate.url).pathname.replace(/\/$/, '') === canonicalPath;
      } catch {
        return false;
      }
    }) || candidates.find((candidate) => candidate.geo || candidate.address) || candidates[0];

  const address = item?.address;
  const addressObject = address && typeof address === 'object' ? address : {};
  const streetAddress =
    typeof address === 'string' ? address.trim() : String(addressObject.streetAddress || '').trim();
  const city = String(addressObject.addressLocality || seed?.name_city || '').trim();
  const country = String(addressObject.addressCountry || '').trim().toUpperCase();
  const lat = finiteCoord(item?.geo?.latitude, -90, 90);
  const lng = finiteCoord(item?.geo?.longitude, -180, 180);
  const phone = String(item?.telephone || '').trim();
  const sameAs = (Array.isArray(item?.sameAs) ? item.sameAs : item?.sameAs ? [item.sameAs] : [])
    .map(String)
    .filter((value) => /^https?:\/\//i.test(value));

  return {
    ...seed,
    name: String(item?.name || seed?.name_fallback || '').trim(),
    address: streetAddress || undefined,
    city: city || undefined,
    country: /^[A-Z]{2}$/.test(country) ? country : undefined,
    lat,
    lng,
    phone: phone || undefined,
    same_as: sameAs,
    schema_types: schemaTypes(item?.['@type']),
    detail_status: item ? 'parsed' : 'no_structured_data',
  };
}

export function toNormalizedVenue(record) {
  const location = {
    city: record.city || titleCaseSlug(record.city_slug) || undefined,
    country: /^[A-Z]{2}$/.test(record.country || '') ? record.country : undefined,
    address: record.address || undefined,
    lat: record.lat,
    lng: record.lng,
  };
  for (const [key, value] of Object.entries(location)) if (value === undefined) delete location[key];

  const contacts = {
    phone: record.phone || undefined,
  };
  for (const [key, value] of Object.entries(contacts)) if (value === undefined) delete contacts[key];

  return {
    entityType: 'venue',
    sourceId: record.source_id,
    sourceName: 'gayout',
    name: record.name || record.name_fallback,
    category: record.category || 'other',
    location,
    ...(Object.keys(contacts).length ? { contacts } : {}),
    tags: ['queer-friendly'],
    metadata: {
      data_source: 'gayout',
      url: record.url,
      lastmod: record.lastmod || null,
      section: record.section,
      region_slug: record.region_slug,
      country_slug: record.country_slug,
      city_slug: record.city_slug,
      schema_types: record.schema_types || [],
      same_as: record.same_as || [],
      detail_status: record.detail_status || 'sitemap_only',
      // Useful for compact audit joins without leaking a second identity scheme.
      source_url_sha256: createHash('sha256').update(record.url).digest('hex'),
      gayout_numeric_id: record.gayout_numeric_id || null,
    },
  };
}
