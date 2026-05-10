import { z } from 'zod';

// ─── Source Names ───────────────────────────────────────────────
export const SourceName = z.enum([
  'patroc',
  'outsavvy',
  'travelgay',
  'iglta',
  'misterbnb',
  'wikipedia',
]);
export type SourceName = z.infer<typeof SourceName>;

// ─── Entity Types ───────────────────────────────────────────────
export const EntityType = z.enum(['venue', 'event', 'place', 'stay']);
export type EntityType = z.infer<typeof EntityType>;

// ─── Geo ────────────────────────────────────────────────────────
export const GeoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Geo = z.infer<typeof GeoSchema>;

// ─── Place (gay villages / neighborhoods) ───────────────────────
export const PlaceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  city: z.string().min(1),
  region: z.string().nullable().optional(),
  country: z.string().min(1),
  geo: GeoSchema.nullable().optional(),
  wikipedia_url: z.string().url().nullable().optional(),
  source_url: z.string().url(),
  tags: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
  first_seen_at: z.date().optional(),
  last_seen_at: z.date().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

// ─── Venue ──────────────────────────────────────────────────────
export const VenueSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  city: z.string().min(1),
  region: z.string().nullable().optional(),
  country: z.string().min(1),
  address: z.string().nullable().optional(),
  geo: GeoSchema.nullable().optional(),
  website: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  opening_hours: z.string().nullable().optional(),
  price_range: z.string().nullable().optional(),
  images: z.array(z.string().url()).default([]),
  source_url: z.string().url(),
  first_seen_at: z.date().optional(),
  last_seen_at: z.date().optional(),
});
export type Venue = z.infer<typeof VenueSchema>;

// ─── Event ──────────────────────────────────────────────────────
export const EventSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  venue_name: z.string().nullable().optional(),
  geo: GeoSchema.nullable().optional(),
  start_datetime: z.date(),
  end_datetime: z.date().nullable().optional(),
  timezone: z.string().default('UTC'),
  ticket_url: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  price_range: z.string().nullable().optional(),
  images: z.array(z.string().url()).default([]),
  source_url: z.string().url(),
  first_seen_at: z.date().optional(),
  last_seen_at: z.date().optional(),
});
export type Event = z.infer<typeof EventSchema>;

// ─── Stay (BnB) ────────────────────────────────────────────────
export const StaySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  city: z.string().min(1),
  region: z.string().nullable().optional(),
  country: z.string().min(1),
  address: z.string().nullable().optional(),
  geo: GeoSchema.nullable().optional(),
  website: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  price_range: z.string().nullable().optional(),
  images: z.array(z.string().url()).default([]),
  source_url: z.string().url(),
  first_seen_at: z.date().optional(),
  last_seen_at: z.date().optional(),
});
export type Stay = z.infer<typeof StaySchema>;

// ─── Source Raw Entity (intermediate) ───────────────────────────
export const SourceRawEntitySchema = z.object({
  source_name: SourceName,
  source_id: z.string(),
  entity_type: EntityType,
  url: z.string().url(),
  raw_data: z.record(z.unknown()),
  fetched_at: z.date(),
});
export type SourceRawEntity = z.infer<typeof SourceRawEntitySchema>;

// ─── Source Snapshot ────────────────────────────────────────────
export const SourceSnapshotSchema = z.object({
  id: z.string().uuid().optional(),
  source_name: SourceName,
  url: z.string().url(),
  content_type: z.enum(['html', 'json', 'xml']),
  content_hash: z.string(),
  content: z.string(),
  fetched_at: z.date(),
});
export type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>;

// ─── Source Entity Map (cross-reference) ────────────────────────
export const SourceEntityMapSchema = z.object({
  id: z.string().uuid().optional(),
  source_name: SourceName,
  source_id: z.string(),
  canonical_entity_id: z.string().uuid(),
  entity_type: EntityType,
  confidence: z.number().min(0).max(1).default(1),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});
export type SourceEntityMap = z.infer<typeof SourceEntityMapSchema>;

// ─── Ingest Run ─────────────────────────────────────────────────
export const IngestRunSchema = z.object({
  id: z.string().uuid().optional(),
  source_name: SourceName,
  entity_type: EntityType.nullable().optional(),
  status: z.enum(['running', 'completed', 'failed', 'partial']),
  started_at: z.date(),
  finished_at: z.date().nullable().optional(),
  pages_fetched: z.number().int().default(0),
  entities_parsed: z.number().int().default(0),
  entities_inserted: z.number().int().default(0),
  entities_updated: z.number().int().default(0),
  entities_deduped: z.number().int().default(0),
  blocked_by_robots: z.number().int().default(0),
  failed_requests: z.number().int().default(0),
  // Field-coverage counters (per-run data-quality telemetry — see migration 003).
  coverage_geo:         z.number().int().default(0),
  coverage_phone:       z.number().int().default(0),
  coverage_website:     z.number().int().default(0),
  coverage_images:      z.number().int().default(0),
  coverage_tags:        z.number().int().default(0),
  coverage_address:     z.number().int().default(0),
  coverage_description: z.number().int().default(0),
  errors: z.array(z.object({
    url: z.string().optional(),
    message: z.string(),
    status_code: z.number().nullable().optional(),
    stack: z.string().nullable().optional(),
    timestamp: z.date(),
  })).default([]),
});
export type IngestRun = z.infer<typeof IngestRunSchema>;

// ─── Dedupe Decision ────────────────────────────────────────────
export const DedupeDecisionSchema = z.object({
  id: z.string().uuid().optional(),
  entity_type: EntityType,
  entity_a_id: z.string().uuid(),
  entity_b_id: z.string().uuid(),
  match_method: z.enum(['name_city_website', 'name_address', 'fuzzy']),
  confidence: z.number().min(0).max(1),
  decision: z.enum(['merge', 'skip', 'pending']),
  created_at: z.date().optional(),
});
export type DedupeDecision = z.infer<typeof DedupeDecisionSchema>;
