/**
 * Types shared between content script, background, and popup.
 *
 * Field names mirror the scraper's normalized schema where possible so the
 * server-side normalize → dedupe → commit pipeline accepts them without a
 * translation layer. See scraper/src/normalize/normalize.ts.
 */

export type EntityType =
  | "venue"
  | "event"
  | "stay"
  | "marketplace_item"
  | "news_article"
  | "place"
  | "organization";

export type ExtractionMethod =
  | "jsonld"
  | "opengraph"
  | "microdata"
  | "dom"
  | "manual";

export interface DetectedItem {
  entity_type: EntityType;
  raw_data: Record<string, unknown>;
  /** 0..1 overall confidence the page describes this item type. */
  confidence: number;
  /** Per-field confidence, optional. */
  field_confidence?: Record<string, number>;
  /** Which extractor produced this item. Highest-tier wins on dedupe inside the popup. */
  extraction_method: ExtractionMethod;
  /** Source page URL. */
  source_url: string;
}

export interface SubmitRequest {
  item: DetectedItem;
  notes?: string;
}

export interface SubmitResponse {
  submission_id: string | number;
  disposition: string;
  rate_limit_remaining?: number;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  user: { id: string; email?: string };
}
