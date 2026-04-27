import { z } from "zod";

/**
 * Submission contract. Mirrors a subset of the scraper's SourceRawEntity.
 * The shape is intentionally permissive — server-side normalize/validate is
 * the single source of truth. Extension does best-effort extraction; the
 * pipeline decides what is acceptable.
 */
export const EntityType = z.enum([
  "venue",
  "event",
  "stay", // hotels / accommodations
  "marketplace_item",
  "news_article",
  "place",
  "organization",
]);
export type EntityType = z.infer<typeof EntityType>;

export const TargetTable = z.enum(["venues", "events", "stays", "personalities"]);

export const FieldConfidence = z.record(z.number().min(0).max(1));

export const RawData = z
  .object({
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    url: z.string().url().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().optional(),
    images: z.array(z.string().url()).optional(),
    tags: z.array(z.string()).optional(),
    extras: z.record(z.unknown()).optional(),
  })
  .catchall(z.unknown());

export const SubmitBody = z.object({
  entity_type: EntityType,
  target_table: TargetTable.optional(),
  raw_data: RawData,
  source_url: z.string().url(),
  client: z.string().max(64).optional(),
  notes: z.string().max(2000).optional(),
  field_confidence: FieldConfidence.optional(),
  extraction_method: z.enum(["jsonld", "opengraph", "microdata", "dom", "manual"]).optional(),
});
export type SubmitBody = z.infer<typeof SubmitBody>;

export function entityTypeToTargetTable(t: EntityType): "venues" | "events" | "stays" | "personalities" | null {
  switch (t) {
    case "venue":
      return "venues";
    case "event":
      return "events";
    case "stay":
      return "stays";
    case "organization":
      return "personalities";
    default:
      return null; // marketplace/news/place — pipeline routes via raw_data
  }
}
