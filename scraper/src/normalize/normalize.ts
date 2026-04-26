import type { SourceRawEntity } from '../types/schemas.js';
import { cleanText } from '../utils/text.js';
import { parseDate, inferTimezone } from '../utils/dates.js';
import { detectLanguage } from '../utils/language.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('normalize');

const LOGO_DEV_API_KEY = process.env.LOGO_DEV_API_KEY || '';

/** Why normalization dropped an entity — written to scraper_normalize_rejections. */
export type RejectReason =
  | 'unknown_entity_type'
  | 'missing_name'
  | 'missing_city'
  | 'missing_country'
  | 'unparseable_start_date'
  | 'exception';

/** Build a logo.dev CDN URL from a website URL */
function buildLogoDevUrl(website: string | null | undefined): string | null {
  if (!website || !LOGO_DEV_API_KEY) return null;
  try {
    const withProtocol = website.match(/^https?:\/\//) ? website : `https://${website}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
    return `https://img.logo.dev/${hostname}?token=${LOGO_DEV_API_KEY}&size=128&format=png`;
  } catch {
    return null;
  }
}

/** Normalized entity ready for DB insertion */
export type NormalizedEntity =
  | { type: 'place'; data: Record<string, unknown> }
  | { type: 'venue'; data: Record<string, unknown> }
  | { type: 'event'; data: Record<string, unknown> }
  | { type: 'stay'; data: Record<string, unknown> };

/** Discriminated result: either a normalized entity, or a rejection reason. */
export type NormalizeResult =
  | { ok: true; entity: NormalizedEntity }
  | { ok: false; reason: RejectReason };

/**
 * Normalize a SourceRawEntity into a canonical entity.
 * Returns a discriminated result so the caller can persist the rejection
 * reason for observability (what % of items from source X fail for which reason).
 */
export function normalizeEntity(raw: SourceRawEntity): NormalizeResult {
  try {
    switch (raw.entity_type) {
      case 'place':  return normalizePlace(raw);
      case 'venue':  return normalizeVenue(raw);
      case 'event':  return normalizeEvent(raw);
      case 'stay':   return normalizeStay(raw);
      default:
        log.warn({ entityType: raw.entity_type }, 'Unknown entity type');
        return { ok: false, reason: 'unknown_entity_type' };
    }
  } catch (err) {
    log.error({ err, sourceId: raw.source_id, source: raw.source_name }, 'Normalization failed');
    return { ok: false, reason: 'exception' };
  }
}

function normalizePlace(raw: SourceRawEntity): NormalizeResult {
  const d = raw.raw_data;

  const name = cleanText(d.name as string);
  if (!name) return { ok: false, reason: 'missing_name' };

  const city = cleanText(d.city as string);
  const country = cleanText(d.country as string);
  if (!city) return { ok: false, reason: 'missing_city' };
  if (!country) return { ok: false, reason: 'missing_country' };

  const geo = parseGeo(d.geo as Record<string, unknown> | undefined);

  const description = cleanText(d.description as string) || null;
  return {
    ok: true,
    entity: {
      type: 'place',
      data: {
        name,
        description,
        language: detectLanguage(description),
        city,
        region: cleanText(d.region as string) || null,
        country,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        wikipedia_url: (d.wikipedia_url as string) || null,
        source_url: (d.source_url as string) || raw.url,
        tags: normalizeTags(d.tags as string[] | undefined),
        images: normalizeImages(d.images as string[] | undefined),
      },
    },
  };
}

function normalizeVenue(raw: SourceRawEntity): NormalizeResult {
  const d = raw.raw_data;

  const name = cleanText(d.name as string);
  if (!name) return { ok: false, reason: 'missing_name' };

  const city = cleanText(d.city as string);
  const country = cleanText(d.country as string);
  if (!city) return { ok: false, reason: 'missing_city' };

  const geo = parseGeo(d.geo as Record<string, unknown> | undefined);
  const website = normalizeUrl(d.website as string) || null;
  const venueDescription = cleanText(d.description as string) || null;

  return {
    ok: true,
    entity: {
      type: 'venue',
      data: {
        name,
        description: venueDescription,
        language: detectLanguage(venueDescription),
        category: cleanText(d.category as string) || null,
        tags: normalizeTags(d.tags as string[] | undefined),
        city,
        region: cleanText(d.region as string) || null,
        country: country || null,
        address: cleanText(d.address as string) || null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        website,
        phone: cleanText(d.phone as string) || null,
        opening_hours: cleanText(d.opening_hours as string) || null,
        price_range: cleanText(d.price_range as string) || null,
        images: normalizeImages(d.images as string[] | undefined),
        source_url: (d.source_url as string) || raw.url,
        logo_url: buildLogoDevUrl(website),
      },
    },
  };
}

function normalizeEvent(raw: SourceRawEntity): NormalizeResult {
  const d = raw.raw_data;

  const name = cleanText(d.name as string);
  if (!name) return { ok: false, reason: 'missing_name' };

  const startDateStr = d.start_datetime as string;
  const startDate = parseDate(startDateStr);
  if (!startDate) {
    log.warn({ sourceId: raw.source_id, dateStr: startDateStr }, 'Cannot parse event start date');
    return { ok: false, reason: 'unparseable_start_date' };
  }

  const endDateStr = d.end_datetime as string | undefined;
  const endDate = endDateStr ? parseDate(endDateStr) : null;

  const city = cleanText(d.city as string) || null;
  const country = cleanText(d.country as string) || null;
  const timezone = (d.timezone as string) || inferTimezone(city, country);
  const geo = parseGeo(d.geo as Record<string, unknown> | undefined);
  const eventDescription = cleanText(d.description as string) || null;

  return {
    ok: true,
    entity: {
      type: 'event',
      data: {
        name,
        description: eventDescription,
        language: detectLanguage(eventDescription),
        category: cleanText(d.category as string) || null,
        tags: normalizeTags(d.tags as string[] | undefined),
        city,
        region: cleanText(d.region as string) || null,
        country,
        address: cleanText(d.address as string) || null,
        venue_name: cleanText(d.venue_name as string) || null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        start_datetime: startDate,
        end_datetime: endDate,
        timezone,
        ticket_url: normalizeUrl(d.ticket_url as string) || null,
        website: normalizeUrl(d.website as string) || null,
        price_range: cleanText(d.price_range as string) || null,
        images: normalizeImages(d.images as string[] | undefined),
        source_url: (d.source_url as string) || raw.url,
        logo_url: buildLogoDevUrl(normalizeUrl(d.website as string)),
      },
    },
  };
}

function normalizeStay(raw: SourceRawEntity): NormalizeResult {
  const d = raw.raw_data;

  const name = cleanText(d.name as string);
  if (!name) return { ok: false, reason: 'missing_name' };

  const city = cleanText(d.city as string);
  if (!city) return { ok: false, reason: 'missing_city' };

  const geo = parseGeo(d.geo as Record<string, unknown> | undefined);
  const stayDescription = cleanText(d.description as string) || null;

  return {
    ok: true,
    entity: {
      type: 'stay',
      data: {
        name,
        description: stayDescription,
        language: detectLanguage(stayDescription),
        category: cleanText(d.category as string) || null,
        tags: normalizeTags(d.tags as string[] | undefined),
        city,
        region: cleanText(d.region as string) || null,
        country: cleanText(d.country as string) || null,
        address: cleanText(d.address as string) || null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        website: normalizeUrl(d.website as string) || null,
        phone: cleanText(d.phone as string) || null,
        price_range: cleanText(d.price_range as string) || null,
        images: normalizeImages(d.images as string[] | undefined),
        source_url: (d.source_url as string) || raw.url,
      },
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function parseGeo(geo: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  if (!geo) return null;
  const lat = typeof geo.lat === 'number' ? geo.lat : parseFloat(geo.lat as string);
  const lng = typeof geo.lng === 'number' ? geo.lng : parseFloat(geo.lng as string);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // (0, 0) is the "Null Island" — almost always an unset default, not the
  // Atlantic point. Treat as missing.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length > 0),
  )];
}

function normalizeImages(images: string[] | undefined): string[] {
  if (!images || !Array.isArray(images)) return [];
  return images
    .map((img) => img.trim())
    .filter((img) => {
      try {
        new URL(img);
        return true;
      } catch {
        return false;
      }
    });
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    try {
      new URL(`https://${trimmed}`);
      return `https://${trimmed}`;
    } catch {
      return null;
    }
  }
}
