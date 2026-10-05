const CATEGORY_BY_SLUG = {
  'gay-bar': 'bar',
  'gay-sauna': 'sauna',
  'gay-cruising': 'cruising',
  'gay-kinos': 'cruising',
  'gay-cinema': 'cruising',
};

export function decodeHtml(value = '') {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    auml: 'ä',
    Auml: 'Ä',
    ouml: 'ö',
    Ouml: 'Ö',
    uuml: 'ü',
    Uuml: 'Ü',
    szlig: 'ß',
  };
  let decoded = String(value);
  for (let pass = 0; pass < 3; pass++) {
    const next = decoded.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
      if (entity[0] !== '#') return named[entity] ?? whole;
      const hex = entity[1]?.toLowerCase() === 'x';
      const codepoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : whole;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function textContent(value = '') {
  return decodeHtml(
    String(value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function attrs(value = '') {
  const out = {};
  for (const match of String(value).matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    out[match[1].toLowerCase()] = decodeHtml(match[3]);
  }
  return out;
}

function finiteCoordinate(value, min, max) {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

function categoryFromClass(className = '') {
  for (const match of String(className).matchAll(/(?:^|\s)listing_category-([\w-]+)/g)) {
    if (CATEGORY_BY_SLUG[match[1]])
      return { category: CATEGORY_BY_SLUG[match[1]], category_slug: match[1] };
  }
  return null;
}

export function listingFromBrowserRow(row) {
  if (!Array.isArray(row) || row.length < 7) return null;
  const [sourceId, url, name, className, addressDisplay, lat, lng, phone, sourceImageUrl] = row;
  const categoryInfo = categoryFromClass(className);
  if (!/^\d+$/.test(String(sourceId || '')) || !url || !name || !categoryInfo) return null;
  let absoluteUrl;
  try {
    absoluteUrl = new URL(url, 'https://planet-randy.com').href;
  } catch {
    return null;
  }
  return {
    source_id: String(sourceId),
    url: absoluteUrl,
    name: decodeHtml(name).trim(),
    category: categoryInfo.category,
    category_slug: categoryInfo.category_slug,
    address_display: decodeHtml(addressDisplay).trim() || undefined,
    lat: finiteCoordinate(lat, -90, 90),
    lng: finiteCoordinate(lng, -180, 180),
    phone: String(phone || '').trim() || undefined,
    source_image_url:
      String(sourceImageUrl || '').replace(/-150x150(?=\.[a-z]+(?:\?|$))/i, '') || undefined,
  };
}

function ringContainsPoint(ring, lng, lat) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if (y > lat !== previousY > lat && lng < ((previousX - x) * (lat - y)) / (previousY - y) + x)
      inside = !inside;
  }
  return inside;
}

function polygonContainsPoint(polygon, lng, lat) {
  return (
    polygon.length > 0 &&
    ringContainsPoint(polygon[0], lng, lat) &&
    !polygon.slice(1).some((hole) => ringContainsPoint(hole, lng, lat))
  );
}

export function countryCodeForPoint(featureCollection, lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  for (const feature of featureCollection?.features || []) {
    const { geometry, properties = {} } = feature || {};
    if (!geometry) continue;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(polygons)) continue;
    if (polygons.some((polygon) => polygonContainsPoint(polygon, lng, lat))) {
      const code = String(properties.ISO_A2_EH || properties.ISO_A2 || '').toUpperCase();
      return /^[A-Z]{2}$/.test(code) ? code : undefined;
    }
  }
  return undefined;
}

export function countryCodeFromAddress(address) {
  const value = String(address || '').trim();
  const aliases = [
    [/\b(?:Germany|Deutschland)\s*$/i, 'DE'],
    [/\b(?:Switzerland|Schweiz|Suisse)\s*$/i, 'CH'],
    [/\b(?:Austria|Österreich)\s*$/i, 'AT'],
    [/\b(?:Netherlands|Nederland)\s*$/i, 'NL'],
    [/\b(?:Denmark|Danmark)\s*$/i, 'DK'],
    [/\b(?:Poland|Polska)\s*$/i, 'PL'],
  ];
  for (const [pattern, code] of aliases) if (pattern.test(value)) return code;
  if (/(?:^|,\s*)\d{5}(?:\s|$)/.test(value)) return 'DE';
  return undefined;
}

export function parseLastPage(html) {
  let last = 1;
  for (const match of String(html).matchAll(/\/eintrag\/page\/(\d+)\//g)) {
    last = Math.max(last, Number(match[1]));
  }
  return last;
}

export function parseListingPage(html) {
  const rows = [];
  for (const article of String(html).matchAll(
    /<article\b([^>]*\blisting-item\b[^>]*)>([\s\S]*?)<\/article>/gi,
  )) {
    const articleAttrs = attrs(article[1]);
    const body = article[2];
    const sourceId = String(articleAttrs['data-id'] || '').trim();
    const categoryInfo = categoryFromClass(articleAttrs.class);
    const titleMatch = /<h4\b[^>]*\bentry-title\b[^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(
      body,
    );
    const titleAttrs = attrs(titleMatch?.[1]);
    const url = titleAttrs.href || articleAttrs['data-permalink'];
    const name = String(
      titleAttrs.title || textContent(titleMatch?.[2]) || articleAttrs['data-title'] || '',
    ).trim();
    if (!/^\d+$/.test(sourceId) || !url || !name || !categoryInfo) continue;

    const addressMatch = /<div\b[^>]*\blisting-address-wrap\b[^>]*>([\s\S]*?)<\/div>/i.exec(body);
    const phoneMatch = /<li\b[^>]*\blisting-phone\b[^>]*>[\s\S]*?<a\b([^>]*)>/i.exec(body);
    const phoneAttrs = attrs(phoneMatch?.[1]);
    const imageUrl =
      articleAttrs['data-image']?.replace(/-150x150(?=\.[a-z]+(?:\?|$))/i, '') || undefined;
    rows.push({
      source_id: sourceId,
      url: new URL(url, 'https://planet-randy.com').href,
      name,
      category: categoryInfo.category,
      category_slug: categoryInfo.category_slug,
      address_display: textContent(addressMatch?.[1]) || articleAttrs['data-address'] || undefined,
      lat: finiteCoordinate(articleAttrs['data-lat'], -90, 90),
      lng: finiteCoordinate(articleAttrs['data-lng'], -180, 180),
      phone: phoneAttrs.href?.replace(/^tel:/i, '').trim() || undefined,
      source_image_url: imageUrl,
    });
  }
  return rows;
}

function flattenJsonLd(value, out = []) {
  if (Array.isArray(value)) for (const item of value) flattenJsonLd(item, out);
  else if (value && typeof value === 'object') {
    out.push(value);
    if (value['@graph']) flattenJsonLd(value['@graph'], out);
  }
  return out;
}

function schemaTypes(value) {
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
}

function firstOfficialWebsite(html) {
  const block = /<li\b[^>]*id=["']listing-website["'][^>]*>([\s\S]*?)<\/li>/i.exec(html)?.[1];
  const link = /<a\b([^>]*)>/i.exec(block || '');
  const href = attrs(link?.[1]).href;
  if (!href) return undefined;
  try {
    const url = new URL(href, 'https://planet-randy.com');
    return /(^|\.)planet-randy\.com$/i.test(url.hostname) ? undefined : url.href;
  } catch {
    return undefined;
  }
}

export function parseDetailPage(html, seed) {
  const objects = [];
  for (const match of String(html).matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      flattenJsonLd(JSON.parse(match[1]), objects);
    } catch {
      /* keep scanning */
    }
  }
  const item =
    objects.find(
      (value) =>
        value.name &&
        schemaTypes(value['@type']).some((type) => /LocalBusiness|Place|Organization/i.test(type)),
    ) || objects.find((value) => value.name && (value.address || value.geo));
  const address = item?.address && typeof item.address === 'object' ? item.address : {};
  const country = String(address.addressCountry || '')
    .trim()
    .toUpperCase();
  const lat = finiteCoordinate(item?.geo?.latitude, -90, 90) ?? seed.lat;
  const lng = finiteCoordinate(item?.geo?.longitude, -180, 180) ?? seed.lng;
  return {
    ...seed,
    name: decodeHtml(item?.name || seed.name).trim(),
    address: decodeHtml(address.streetAddress || seed.address_display).trim() || undefined,
    city: decodeHtml(address.addressLocality).trim() || undefined,
    state: decodeHtml(address.addressRegion).trim() || undefined,
    postal_code: String(address.postalCode || '').trim() || undefined,
    country: /^[A-Z]{2}$/.test(country) ? country : undefined,
    lat,
    lng,
    phone: String(item?.telephone || seed.phone || '').trim() || undefined,
    website: firstOfficialWebsite(html),
    schema_types: schemaTypes(item?.['@type']),
    detail_status: item ? 'parsed' : 'no_structured_data',
  };
}

export function validateRecord(record) {
  const errors = [];
  if (!/^\d+$/.test(String(record.source_id || ''))) errors.push('invalid_source_id');
  if (!String(record.name || '').trim()) errors.push('missing_name');
  if (!Object.values(CATEGORY_BY_SLUG).includes(record.category)) errors.push('invalid_category');
  if (!/^[A-Z]{2}$/.test(record.country || '')) errors.push('missing_iso2_country');
  const hasLat = Number.isFinite(record.lat);
  const hasLng = Number.isFinite(record.lng);
  if (hasLat !== hasLng) errors.push('partial_coordinate_pair');
  if (!record.address && !(hasLat && hasLng)) errors.push('missing_location');
  return errors;
}

export function toNormalizedVenue(record) {
  const location = {
    address: record.address,
    city: record.city,
    state: record.state,
    postal_code: record.postal_code,
    country: record.country,
    lat: record.lat,
    lng: record.lng,
  };
  for (const key of Object.keys(location)) if (location[key] === undefined) delete location[key];
  const contacts = { phone: record.phone, website: record.website };
  for (const key of Object.keys(contacts)) if (!contacts[key]) delete contacts[key];
  return {
    entityType: 'venue',
    sourceId: String(record.source_id),
    sourceName: 'planet-randy',
    name: record.name,
    category: record.category,
    location,
    ...(Object.keys(contacts).length ? { contacts } : {}),
    tags: ['queer-friendly', record.category === 'cruising' ? 'cruising' : record.category].filter(
      Boolean,
    ),
    metadata: {
      data_source: 'planet-randy',
      url: record.url,
      wordpress_post_id: String(record.source_id),
      source_category: record.category_slug,
      source_image_url: record.source_image_url || null,
      schema_types: record.schema_types || [],
      detail_status: record.detail_status || 'listing_only',
    },
  };
}
