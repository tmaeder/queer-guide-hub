import { z } from 'zod';

// ─── Source Names ───────────────────────────────────────────────
export const SourceName = z.enum([
  'patroc',
  'outsavvy',
  'travelgay',
  'iglta',
  'misterbnb',
  'wikipedia',
  'gaycities',
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
  raw_data: z.record(z.string(), z.unknown()),
  fetched_at: z.date(),
});
export type SourceRawEntity = z.infer<typeof SourceRawEntitySchema>;
