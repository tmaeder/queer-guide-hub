/**
 * Unified image resolver for cities, countries, and events.
 *
 * Fallback order (first valid wins):
 *   1. curated_image_url (manual override)
 *   2. record.image_url / event.images[] (if not flagged and URL is valid)
 *   3. null — caller should render placeholder and optionally trigger fetch
 *
 * This is a pure function. Fetching live images via edge functions is the
 * caller's responsibility (see CountryHeroImages / useCityImages).
 */

export type EntityKind = 'city' | 'country' | 'event';

interface CityOrCountryRecord {
  id?: string;
  image_url?: string | null;
  curated_image_url?: string | null;
  image_flagged?: boolean | null;
  image_metadata?: unknown;
}

interface EventRecord {
  id?: string;
  images?: Array<string | null | undefined> | null;
  image_url?: string | null;
}

export interface ResolvedImage {
  url: string | null;
  source: 'curated' | 'persisted' | 'event-images' | 'none';
  metadata?: unknown;
}

// Hosts known to reliably return broken responses (populate from QA).
const DENY_HOSTS = new Set<string>([]);

export function isValidImageUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (!/^https:\/\//i.test(url)) return false;
  if (url.startsWith('data:image/svg')) return false;
  try {
    const u = new URL(url);
    if (DENY_HOSTS.has(u.host)) return false;
  } catch {
    return false;
  }
  return true;
}

export function resolveEntityImage(
  kind: EntityKind,
  record: CityOrCountryRecord | EventRecord | null | undefined,
): ResolvedImage {
  if (!record) return { url: null, source: 'none' };

  if (kind === 'event') {
    const ev = record as EventRecord;
    const images = Array.isArray(ev.images) ? ev.images : [];
    for (const candidate of images) {
      if (isValidImageUrl(candidate)) {
        return { url: candidate, source: 'event-images' };
      }
    }
    if (isValidImageUrl(ev.image_url)) {
      return { url: ev.image_url, source: 'persisted' };
    }
    return { url: null, source: 'none' };
  }

  const rec = record as CityOrCountryRecord;
  if (isValidImageUrl(rec.curated_image_url)) {
    return { url: rec.curated_image_url, source: 'curated', metadata: rec.image_metadata };
  }
  if (!rec.image_flagged && isValidImageUrl(rec.image_url)) {
    return { url: rec.image_url, source: 'persisted', metadata: rec.image_metadata };
  }
  return { url: null, source: 'none' };
}
