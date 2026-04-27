/**
 * Canonical Zod schemas + TypeScript types for all entity kinds.
 *
 * SourceRawEntity  – intermediate object produced by each connector parser.
 * Normalized*      – canonical form stored in the database.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const GeoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type Geo = z.infer<typeof GeoSchema>

export const EntityTypeSchema = z.enum(['venue', 'event', 'stay', 'place'])
export type EntityType = z.infer<typeof EntityTypeSchema>

// ---------------------------------------------------------------------------
// Source raw entity  (connector output before normalization)
// ---------------------------------------------------------------------------

export const SourceRawEntitySchema = z.object({
  source: z.string(),
  sourceId: z.string(),
  entityType: EntityTypeSchema,
  url: z.string().url(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  geo: GeoSchema.nullable().optional(),
  website: z.string().url().nullable().optional(),
  phone: z.string().nullable().optional(),
  images: z.array(z.string().url()).default([]),

  // Event-specific
  startDatetime: z.string().nullable().optional(),
  endDatetime: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  ticketUrl: z.string().url().nullable().optional(),

  // Venue-specific
  venueType: z.string().nullable().optional(),
  openingHours: z.string().nullable().optional(),
  priceRange: z.string().nullable().optional(),

  // Place-specific
  placeType: z.string().nullable().optional(),
  wikipediaUrl: z.string().url().nullable().optional(),

  // Stay-specific
  pricePerNight: z.number().positive().nullable().optional(),
  priceCurrency: z.string().length(3).nullable().optional(),
  amenities: z.array(z.string()).default([]),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().nonnegative().nullable().optional(),

  // Metadata
  fetchedAt: z.string().datetime(),
  snapshotChecksum: z.string().nullable().optional(),
})
export type SourceRawEntity = z.infer<typeof SourceRawEntitySchema>

// ---------------------------------------------------------------------------
// Canonical normalized entities
// ---------------------------------------------------------------------------

const CanonicalBaseSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  address: z.string().nullable(),
  geo: GeoSchema.nullable(),
  website: z.string().url().nullable(),
  phone: z.string().nullable(),
  images: z.array(z.string().url()),
  sourceUrl: z.string().url(),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
})

export const NormalizedVenueSchema = CanonicalBaseSchema.extend({
  entityType: z.literal('venue'),
  venueType: z.string().nullable(),
  openingHours: z.string().nullable(),
  priceRange: z.string().nullable(),
})
export type NormalizedVenue = z.infer<typeof NormalizedVenueSchema>

export const NormalizedEventSchema = CanonicalBaseSchema.extend({
  entityType: z.literal('event'),
  startDatetime: z.date(),
  endDatetime: z.date().nullable(),
  timezone: z.string().nullable(),
  venueId: z.string().uuid().nullable(),
  ticketUrl: z.string().url().nullable(),
  priceRange: z.string().nullable(),
})
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>

export const NormalizedPlaceSchema = CanonicalBaseSchema.extend({
  entityType: z.literal('place'),
  placeType: z.string().nullable(),
  wikipediaUrl: z.string().url().nullable(),
})
export type NormalizedPlace = z.infer<typeof NormalizedPlaceSchema>

export const NormalizedStaySchema = CanonicalBaseSchema.extend({
  entityType: z.literal('stay'),
  pricePerNight: z.number().nullable(),
  priceCurrency: z.string().nullable(),
  amenities: z.array(z.string()),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
})
export type NormalizedStay = z.infer<typeof NormalizedStaySchema>

export type NormalizedEntity =
  | NormalizedVenue
  | NormalizedEvent
  | NormalizedPlace
  | NormalizedStay
