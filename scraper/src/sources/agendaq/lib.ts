import type { PublishableEntity } from '../../db/staging-publisher.js';

export const AGENDAQ_API_URL = 'https://data.agendaq.fr/api/v1/businesses';
export const AGENDAQ_CONTENT_URL = 'https://data.agendaq.fr';
export const AGENDAQ_SITE_URL = 'https://www.agendaq.fr';
export const AGENDAQ_PAGE_SIZE = 36;

export type AgendaqAsset = [
  role: string,
  path: string,
  mime?: string,
  width?: number,
  height?: number,
  position?: number,
  metadata?: Record<string, unknown>,
];

export interface AgendaqAddress {
  pc?: string | null;
  sn?: string | null;
  city?: string | null;
  region?: string | null;
  street?: string | null;
}

export interface AgendaqLocation {
  id?: number;
  label?: string | null;
  lat?: number | null;
  lon?: number | null;
  cc?: string | null;
  addr?: AgendaqAddress | null;
  approx?: boolean;
}

export interface AgendaqBusinessRef {
  id?: string;
  name?: string;
  tx?: number[];
}

export interface AgendaqDateRule {
  tz?: string;
  start?: string;
  end?: string;
  startH?: string;
  endH?: string;
  allDay?: string | boolean;
  recurring?: string;
  every?: number;
  label?: string;
  [weekday: `w.${number}`]: boolean | undefined;
}

export interface AgendaqEvent {
  updatedOn?: string;
  name?: string;
  slug?: string;
  description?: string;
  descShort?: string;
  start?: string;
  end?: string;
  assets?: AgendaqAsset[];
  businesses?: AgendaqBusinessRef[];
  dates?: Array<[string, AgendaqDateRule]>;
  locations?: AgendaqLocation[];
  data?: Record<string, unknown>;
  taxons?: number[];
  tags?: number[];
  price?: number;
  parent?: { id?: string; name?: string };
}

export interface AgendaqVenue {
  updatedOn?: string;
  name?: string;
  slug?: string;
  description?: string;
  descShort?: string;
  assets?: AgendaqAsset[];
  locations?: AgendaqLocation[];
  data?: Record<string, unknown>;
  tags?: number[];
  taxons?: number[];
  events?: AgendaqEvent[];
  people?: unknown[];
}

export interface AgendaqPage {
  count: number;
  items: AgendaqVenue[];
}

export interface AgendaqFetchResult {
  reportedTotal: number;
  venues: AgendaqVenue[];
  pagesFetched: number;
}

export interface AgendaqFetchOptions {
  offset?: number;
  limit?: number;
  concurrency?: number;
  retries?: number;
  crawlDelayMs?: number;
  fetchFn?: typeof fetch;
  onProgress?: (completed: number, total: number) => void;
}

const BUSINESS_CATEGORY_BY_TAXON: Record<number, string> = {
  63: 'event-venue',
  64: 'community_center',
  65: 'bar',
  66: 'cruising',
  67: 'bar',
  68: 'community_center',
  69: 'sauna',
  70: 'sauna',
  71: 'community_center',
  72: 'club',
  73: 'club',
  76: 'shop',
  77: 'shop',
  99: 'cruising',
  100: 'community_center',
  101: 'community_center',
  102: 'other',
  104: 'hotel',
  116: 'outdoor',
  117: 'cruising',
  119: 'restaurant',
  125: 'salon',
  128: 'shop',
  130: 'theater',
  132: 'other',
};

const EVENT_TYPE_BY_TAXON: Record<number, string> = {
  106: 'festival',
  107: 'conference',
  108: 'sports',
  109: 'fetish',
  110: 'party',
  111: 'art',
  121: 'community',
  122: 'social',
  134: 'fetish',
  135: 'concert',
  136: 'theater',
  137: 'theater',
  138: 'film',
  148: 'drag',
  149: 'social',
  150: 'social',
  151: 'social',
  173: 'other',
  214: 'drag',
  216: 'theater',
  217: 'pride',
  219: 'fetish',
};

const AUDIENCE_BY_TAXON: Record<number, string> = {
  178: 'gay',
  179: 'gay-friendly',
  180: 'lesbian',
  181: 'lesbian-friendly',
  182: 'trans',
  183: 'trans-friendly',
  184: 'bisexual',
  185: 'queer-friendly',
  186: 'queer',
  187: 'bear',
  188: 'naturist',
  189: 'drag',
  211: 'flinta',
};

const ISO_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

export function stripAgendaqHtml(value: unknown): string | null {
  const input = cleanString(value);
  if (!input) return null;
  const cleaned = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return cleaned || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function absoluteUrl(value: unknown, base = AGENDAQ_SITE_URL): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw, base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function assetUrls(assets: AgendaqAsset[] | undefined): string[] {
  if (!Array.isArray(assets)) return [];
  return [
    ...new Set(
      assets
        .map((asset) => absoluteUrl(asset?.[1], AGENDAQ_CONTENT_URL))
        .filter((url): url is string => !!url),
    ),
  ];
}

function preferredLocation(locations: AgendaqLocation[] | undefined): AgendaqLocation | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  return locations.find((location) => !location.approx) ?? locations[0] ?? null;
}

function addressLabel(location: AgendaqLocation | null): string | null {
  if (!location) return null;
  const label = cleanString(location.label);
  if (label) return label;
  const addr = location.addr ?? {};
  const street = [cleanString(addr.sn), cleanString(addr.street)].filter(Boolean).join(' ');
  return [street, cleanString(addr.city), cleanString(addr.pc)].filter(Boolean).join(', ') || null;
}

function socialLinks(data: Record<string, unknown>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const socials = Array.isArray(data.socials) ? data.socials : [];
  for (const value of socials) {
    const item = asRecord(value);
    const platform = cleanString(item.socialPlatform)?.toLowerCase();
    const url = absoluteUrl(item.socialId);
    if (!platform || !url) continue;
    (result[platform] ??= []).push(url);
  }
  return result;
}

function contactValue(data: Record<string, unknown>, key: string): string | null {
  return cleanString(data[key]);
}

function sourceWarnings(
  name: string | null,
  location: AgendaqLocation | null,
  start?: string | null,
): string[] {
  const warnings: string[] = [];
  if (!name) warnings.push('missing_name');
  if (!location) warnings.push('missing_location');
  if (start === null) warnings.push('missing_start');
  return warnings;
}

export function agendaqVenueUrl(slug: string): string {
  return `${AGENDAQ_SITE_URL}/fr/guide/${encodeURIComponent(slug)}`;
}

export function agendaqEventUrl(slug: string): string {
  return `${AGENDAQ_SITE_URL}/fr/agenda/${encodeURIComponent(slug)}`;
}

export async function fetchAgendaqPage(
  offset: number,
  options: Pick<AgendaqFetchOptions, 'fetchFn' | 'retries'> = {},
): Promise<AgendaqPage> {
  const fetchFn = options.fetchFn ?? fetch;
  const retries = Math.max(0, options.retries ?? 4);
  const url = new URL(AGENDAQ_API_URL);
  url.searchParams.set('offset', String(Math.max(0, offset)));

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchFn(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'QueerGuideBot/1.0 (AgendaQ data import; contact@queer.guide)',
        },
      });
      if (!response.ok) throw new Error(`AgendaQ API HTTP ${response.status} at offset ${offset}`);
      const body = (await response.json()) as Partial<AgendaqPage>;
      if (!Number.isInteger(body.count) || !Array.isArray(body.items)) {
        throw new Error(`AgendaQ API returned an invalid page at offset ${offset}`);
      }
      return { count: body.count as number, items: body.items };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === retries) break;
      await sleep(300 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error(`AgendaQ page fetch failed at offset ${offset}`);
}

export async function fetchAllAgendaq(
  options: AgendaqFetchOptions = {},
): Promise<AgendaqFetchResult> {
  const startOffset = Math.max(0, options.offset ?? 0);
  const first = await fetchAgendaqPage(startOffset, options);
  const sourceEnd = first.count;
  const requestedEnd =
    options.limit == null
      ? sourceEnd
      : Math.min(sourceEnd, startOffset + Math.max(0, options.limit));
  const pageSize = first.items.length || AGENDAQ_PAGE_SIZE;
  const offsets: number[] = [];
  for (let offset = startOffset + pageSize; offset < requestedEnd; offset += pageSize)
    offsets.push(offset);

  const pages = new Map<number, AgendaqVenue[]>([[startOffset, first.items]]);
  let cursor = 0;
  let completed = 1;
  const totalPages = offsets.length + 1;
  options.onProgress?.(completed, totalPages);

  async function worker(): Promise<void> {
    while (cursor < offsets.length) {
      const offset = offsets[cursor++];
      const page = await fetchAgendaqPage(offset, options);
      if (page.count !== first.count) {
        throw new Error(`AgendaQ total changed during import (${first.count} -> ${page.count})`);
      }
      pages.set(offset, page.items);
      completed++;
      options.onProgress?.(completed, totalPages);
      if (options.crawlDelayMs && cursor < offsets.length) await sleep(options.crawlDelayMs);
    }
  }

  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 1));
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, offsets.length)) }, () => worker()),
  );
  const venues = [...pages.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, items]) => items)
    .slice(0, requestedEnd - startOffset);

  return { reportedTotal: first.count, venues, pagesFetched: totalPages };
}

export function collectUniqueAgendaqEvents(venues: AgendaqVenue[]): Map<string, AgendaqEvent> {
  const events = new Map<string, AgendaqEvent>();
  const fingerprints = new Map<string, string>();
  for (const venue of venues) {
    for (const event of venue.events ?? []) {
      const slug = cleanString(event.slug);
      if (!slug) continue;
      const fingerprint = JSON.stringify(event);
      const previous = fingerprints.get(slug);
      if (previous && previous !== fingerprint) {
        throw new Error(`AgendaQ event slug has conflicting payloads: ${slug}`);
      }
      if (!previous) {
        fingerprints.set(slug, fingerprint);
        events.set(slug, event);
      }
    }
  }
  return events;
}

function venueCategory(taxons: number[] | undefined): string {
  for (const taxon of taxons ?? []) {
    const category = BUSINESS_CATEGORY_BY_TAXON[taxon];
    if (category) return category;
  }
  return 'other';
}

function eventType(taxons: number[] | undefined): string {
  for (const taxon of taxons ?? []) {
    const type = EVENT_TYPE_BY_TAXON[taxon];
    if (type) return type;
  }
  return 'other';
}

function audiences(taxons: number[] | undefined): string[] {
  return [
    ...new Set(
      (taxons ?? [])
        .map((taxon) => AUDIENCE_BY_TAXON[taxon])
        .filter((value): value is string => !!value),
    ),
  ];
}

function openingHours(data: Record<string, unknown>): Record<string, unknown> | null {
  const raw = Array.isArray(data.open) ? data.open : [];
  const weekly = raw.flatMap((entry) => {
    if (!Array.isArray(entry) || entry[0] !== 'dow') return [];
    const dayIndex = Number(entry[1]);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return [];
    return [{ day: ISO_DAY[dayIndex], start: cleanString(entry[2]), end: cleanString(entry[3]) }];
  });
  return weekly.length ? { format: 'weekly_intervals', weekly, confidence: 'feed' } : null;
}

export interface NormalizedAgendaqVenue {
  name: string;
  description: string | null;
  category: string;
  location: Record<string, unknown>;
  contacts: Record<string, string | null>;
  hours: Record<string, unknown> | null;
  images: string[];
  tags: string[];
  metadata: Record<string, unknown>;
}

export function normalizeAgendaqVenue(venue: AgendaqVenue): NormalizedAgendaqVenue {
  const data = asRecord(venue.data);
  const location = preferredLocation(venue.locations);
  const name = cleanString(venue.name) ?? cleanString(venue.slug) ?? 'Unnamed AgendaQ venue';
  const slug = cleanString(venue.slug) ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const description = stripAgendaqHtml(
    data.desc ?? data.descShort ?? venue.description ?? venue.descShort,
  );
  const country = cleanString(location?.cc)?.toUpperCase() ?? null;
  const images = assetUrls(venue.assets);

  return {
    name,
    description,
    category: venueCategory(venue.taxons),
    location: {
      address: addressLabel(location),
      city: cleanString(location?.addr?.city),
      state: cleanString(location?.addr?.region),
      postal_code: cleanString(location?.addr?.pc),
      country,
      country_code: country,
      lat: typeof location?.lat === 'number' ? location.lat : null,
      lng: typeof location?.lon === 'number' ? location.lon : null,
      approximate: location?.approx === true,
    },
    contacts: {
      phone: contactValue(data, 'phone'),
      email: contactValue(data, 'email'),
      website: absoluteUrl(data.url),
    },
    hours: openingHours(data),
    images,
    tags: [],
    metadata: {
      id: slug,
      source_id: slug,
      url: agendaqVenueUrl(slug),
      source_url: agendaqVenueUrl(slug),
      updated_on: cleanString(venue.updatedOn),
      agendaq_taxons: venue.taxons ?? [],
      agendaq_tags: venue.tags ?? [],
      audiences: audiences(venue.taxons),
      social_links: socialLinks(data),
      opening_hours_raw: Array.isArray(data.open) ? data.open : [],
      quality_warnings: sourceWarnings(cleanString(venue.name), location),
    },
  };
}

function eventBounds(event: AgendaqEvent): { start: string | null; end: string | null } {
  const start = cleanString(event.start);
  const end = cleanString(event.end);
  if (start) return { start, end: overnightEnd(start, end) };

  const starts = (event.dates ?? [])
    .map(([, rule]) => cleanString(rule.start))
    .filter((value): value is string => !!value)
    .sort();
  const ends = (event.dates ?? [])
    .map(([, rule]) => cleanString(rule.end) ?? cleanString(rule.start))
    .filter((value): value is string => !!value)
    .sort();
  // Bare dates are honest source values and pass the event source contract.
  return { start: starts[0] ?? null, end: ends.at(-1) ?? null };
}

function overnightEnd(start: string, end: string | null): string | null {
  if (!end || !start.includes('T') || !end.includes('T')) return end;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs >= startMs) return end;
  // AgendaQ represents after-midnight closing times on the start date. Only
  // repair that bounded case; larger inversions remain visible to validation.
  if (startMs - endMs >= 24 * 60 * 60 * 1_000) return end;
  return new Date(endMs + 24 * 60 * 60 * 1_000).toISOString();
}

export function agendaqSchedule(event: AgendaqEvent): Record<string, unknown> | null {
  const rules = event.dates ?? [];
  const recurringRules = rules.filter(([, rule]) => !!cleanString(rule.recurring));
  const explicitRules = rules.filter(([, rule]) => !cleanString(rule.recurring));
  if (recurringRules.length === 0 && explicitRules.length <= 1) return null;

  const weekly = recurringRules.flatMap(([, rule]) =>
    ISO_DAY.flatMap((day, index) =>
      rule[`w.${index}`] === true
        ? [{ day, start: cleanString(rule.startH), end: cleanString(rule.endH) }]
        : [],
    ),
  );
  const extra = explicitRules.flatMap(([, rule]) => {
    const date = cleanString(rule.start);
    if (!date) return [];
    return [{ date, start: cleanString(rule.startH) ?? '00:00', end: cleanString(rule.endH) }];
  });
  const timezone = rules.map(([, rule]) => cleanString(rule.tz)).find(Boolean) ?? 'Europe/Paris';
  const until =
    rules
      .map(([, rule]) => cleanString(rule.end))
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null;

  return {
    kind: 'recurrence',
    tz: timezone,
    until,
    weekly,
    extra,
    exceptions: [],
    confidence: 'feed',
    source: 'agendaq',
  };
}

export interface NormalizedAgendaqEvent {
  title: string;
  name: string;
  description: string | null;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  location: Record<string, unknown>;
  venue_name: string | null;
  ticket_url: string | null;
  website: string;
  images: string[];
  tags: string[];
  target_groups: string[];
  schedule: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export function normalizeAgendaqEvent(
  event: AgendaqEvent,
  venuesBySlug?: ReadonlyMap<string, AgendaqVenue>,
): NormalizedAgendaqEvent {
  const data = asRecord(event.data);
  const linkedVenue = (event.businesses ?? [])
    .map((business) => (business.id ? venuesBySlug?.get(business.id) : undefined))
    .find((venue): venue is AgendaqVenue => !!venue?.locations?.length);
  const ownLocation = preferredLocation(event.locations);
  const location = ownLocation ?? preferredLocation(linkedVenue?.locations);
  const bounds = eventBounds(event);
  const slug = cleanString(event.slug) ?? 'unknown-event';
  const title = cleanString(event.name) ?? slug;
  const business = event.businesses?.[0] ?? null;
  const description = stripAgendaqHtml(
    event.description ?? event.descShort ?? data.desc ?? data.descShort,
  );
  const country = cleanString(location?.cc)?.toUpperCase() ?? null;
  const timezone =
    (event.dates ?? []).map(([, rule]) => cleanString(rule.tz)).find(Boolean) ?? null;

  return {
    title,
    name: title,
    description,
    event_type: eventType(event.taxons),
    start_date: bounds.start,
    end_date: bounds.end,
    timezone,
    location: {
      address: addressLabel(location),
      city: cleanString(location?.addr?.city),
      state: cleanString(location?.addr?.region),
      postal_code: cleanString(location?.addr?.pc),
      country,
      country_code: country,
      lat: typeof location?.lat === 'number' ? location.lat : null,
      lng: typeof location?.lon === 'number' ? location.lon : null,
      timezone,
      approximate: location?.approx === true,
    },
    venue_name: cleanString(business?.name),
    ticket_url: absoluteUrl(data.url),
    website: agendaqEventUrl(slug),
    images: assetUrls(event.assets),
    tags: [],
    target_groups: audiences(event.taxons),
    schedule: agendaqSchedule(event),
    metadata: {
      id: slug,
      source_id: slug,
      url: agendaqEventUrl(slug),
      source_url: agendaqEventUrl(slug),
      updated_on: cleanString(event.updatedOn),
      agendaq_taxons: event.taxons ?? [],
      agendaq_tags: event.tags ?? [],
      agendaq_dates: event.dates ?? [],
      agendaq_businesses: event.businesses ?? [],
      parent: event.parent ?? null,
      price: typeof event.price === 'number' ? event.price : null,
      social_links: socialLinks(data),
      venue_name: cleanString(business?.name),
      location_source: ownLocation ? 'event' : linkedVenue ? 'linked_venue' : null,
      location_source_venue: linkedVenue?.slug ?? null,
      quality_warnings: sourceWarnings(cleanString(event.name), location, bounds.start),
    },
  };
}

export function agendaqVenueEntity(venue: AgendaqVenue, fetchedAt = new Date()): PublishableEntity {
  const slug = cleanString(venue.slug);
  if (!slug) throw new Error('AgendaQ venue is missing a slug');
  return {
    source_name: 'agendaq',
    source_id: slug,
    entity_type: 'venue',
    url: agendaqVenueUrl(slug),
    raw_data: venue as unknown as Record<string, unknown>,
    fetched_at: fetchedAt,
    normalized_data: normalizeAgendaqVenue(venue),
  };
}

export function agendaqEventEntity(
  event: AgendaqEvent,
  fetchedAt = new Date(),
  venuesBySlug?: ReadonlyMap<string, AgendaqVenue>,
): PublishableEntity {
  const slug = cleanString(event.slug);
  if (!slug) throw new Error('AgendaQ event is missing a slug');
  return {
    source_name: 'agendaq',
    source_id: slug,
    entity_type: 'event',
    url: agendaqEventUrl(slug),
    raw_data: event as unknown as Record<string, unknown>,
    fetched_at: fetchedAt,
    normalized_data: normalizeAgendaqEvent(event, venuesBySlug),
  };
}
