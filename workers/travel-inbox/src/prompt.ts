/**
 * LLM prompt + response shape for booking-confirmation parsing.
 * Kept in its own file so it can be unit-tested without the worker
 * runtime. Duplicated from workers/trip-inbox (kept independent per-worker).
 */

export interface ParseInput {
  subject: string;
  from: string;
  body: string;
}

/** Event/venue candidates from a forwarded announcement (not a booking). */
export interface ExtractedEntity {
  title?: string;
  name?: string;
  [key: string]: unknown;
}
export interface ExtractedEntities {
  events: ExtractedEntity[];
  venues: ExtractedEntity[];
}

export interface ParsedBooking {
  type: 'lodging' | 'flight' | 'rail' | 'restaurant' | 'activity' | 'event' | 'venue' | 'unknown';
  vendor: string | null;
  title: string | null;
  start: string | null; // ISO 8601 or null
  end: string | null;
  location: string | null;
  price: number | null;
  currency: string | null;
  confirmation: string | null;
  confidence: number; // 0..1
  /** Present only for event/venue announcements — candidates to stage. */
  entities?: ExtractedEntities | null;
}

export const SYSTEM_PROMPT = [
  'You are a strict JSON extractor for forwarded travel emails.',
  'Read the email and emit ONE JSON object with these fields:',
  '  type:          one of "lodging" | "flight" | "rail" | "restaurant" | "activity" | "event" | "venue" | "unknown"',
  '  vendor:        the brand fulfilling the booking (e.g. "Booking.com", "Airbnb", "Lufthansa", "OpenTable") or null',
  '  title:         short human label (e.g. "Hotel Lutetia, Paris" or "LH441 FRA → JFK") or null',
  '  start:         ISO 8601 timestamp with timezone if known, else null',
  '  end:           ISO 8601 timestamp with timezone, else null',
  '  location:      free-text destination/address, else null',
  '  price:         number (no currency symbol), else null',
  '  currency:      ISO 4217 code (USD, EUR, ...), else null',
  '  confirmation:  the confirmation/booking/PNR number, else null',
  '  confidence:    number 0..1, your confidence in the classification',
  '  entities:      ONLY for newsletters/announcements listing LGBTQ+ events or venues (not a personal booking):',
  '                 { "events": [ { "title", "start", "end", "location", "description", "url" } ],',
  '                   "venues": [ { "name", "location", "description", "url" } ] }',
  '                 Omit or null when the email is a personal booking confirmation.',
  'Return JSON only — no prose, no markdown fences.',
  'Set type="event" or "venue" (not a booking type) when the email announces events/venues rather than confirming a reservation.',
  'If the email is neither a booking nor an announcement, return type="unknown" with confidence < 0.3.',
].join('\n');

export function buildUserMessage(input: ParseInput): string {
  // Trim aggressively so we stay inside the model's context for free-tier-shaped
  // costs. 12k chars is enough for ~98% of confirmation emails.
  const body = input.body.length > 12000 ? input.body.slice(0, 12000) : input.body;
  return [
    `From: ${input.from}`,
    `Subject: ${input.subject}`,
    '',
    body,
  ].join('\n');
}

export function parseLLMResponse(raw: string): ParsedBooking {
  // Strip code fences just in case the model wrapped JSON.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {
      type: 'unknown',
      vendor: null,
      title: null,
      start: null,
      end: null,
      location: null,
      price: null,
      currency: null,
      confirmation: null,
      confidence: 0,
    };
  }

  const allowedTypes = new Set([
    'lodging', 'flight', 'rail', 'restaurant', 'activity', 'event', 'venue', 'unknown',
  ]);
  const t = typeof obj.type === 'string' && allowedTypes.has(obj.type)
    ? (obj.type as ParsedBooking['type'])
    : 'unknown';

  const strOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const numOrNull = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
    return null;
  };
  const conf = numOrNull(obj.confidence);

  // Only accept entities for event/venue announcements; keep arrays of objects.
  let entities: ExtractedEntities | null = null;
  if ((t === 'event' || t === 'venue') && obj.entities && typeof obj.entities === 'object') {
    const rawEnt = obj.entities as Record<string, unknown>;
    const asArr = (v: unknown): ExtractedEntity[] =>
      Array.isArray(v) ? v.filter((x): x is ExtractedEntity => !!x && typeof x === 'object') : [];
    const events = asArr(rawEnt.events).slice(0, 20);
    const venues = asArr(rawEnt.venues).slice(0, 20);
    if (events.length || venues.length) entities = { events, venues };
  }

  return {
    type: t,
    vendor: strOrNull(obj.vendor),
    title: strOrNull(obj.title),
    start: strOrNull(obj.start),
    end: strOrNull(obj.end),
    location: strOrNull(obj.location),
    price: numOrNull(obj.price),
    currency: strOrNull(obj.currency),
    confirmation: strOrNull(obj.confirmation),
    confidence: conf === null ? 0 : Math.min(1, Math.max(0, conf)),
    entities,
  };
}

/**
 * Map the LLM booking type to a `travel_inbox_items.parsed_type` value.
 * The per-user travel inbox stores personal bookings only, so event/venue
 * announcements collapse to 'unknown' (they are not staged here).
 */
export function toStoredType(t: ParsedBooking['type']): string {
  return t === 'event' || t === 'venue' ? 'unknown' : t;
}
