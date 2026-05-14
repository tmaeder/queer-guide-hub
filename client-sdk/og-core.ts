/**
 * Canonical OpenGraph / Twitter Card extraction core. Used by both the
 * in-page extractor (extension/src/shared/extractors/opengraph.ts) and the
 * worker /render fallback (workers/submit/src/render.ts).
 *
 * The DOM-bound layer is responsible for collecting `<meta>` tags into a
 * Map<key, value>; everything below works on that map alone, so it runs
 * unchanged in a Cloudflare Worker (where it's fed by HTMLRewriter).
 */

import type { EntityType } from "./entity-types";
import type { DetectedItem } from "./jsonld-core";

export type MetaMap = Map<string, string>;

/**
 * Build a DetectedItem from a fully-collected meta map. Returns null when
 * the page exposes no recognisable og:type and the platform fallback also
 * fails — the caller can then drop into other extractors.
 */
export function buildOgItem(meta: MetaMap, sourceUrl: string): DetectedItem | null {
  if (!meta.size) return null;

  const entityType = mapOgType(meta.get("og:type") || "") ?? inferFromPlatform(meta, sourceUrl);
  if (!entityType) return null;

  const raw: Record<string, unknown> = {};
  const fc: Record<string, number> = {};

  pick(meta, raw, fc, "title", ["og:title", "twitter:title"], 0.85);
  pick(meta, raw, fc, "description", ["og:description", "twitter:description", "description"], 0.7);
  pick(meta, raw, fc, "url", ["og:url"], 0.9);
  pick(meta, raw, fc, "site_name", ["og:site_name"], 0.8);

  const image = meta.get("og:image") || meta.get("twitter:image");
  if (image) { raw.images = [image]; fc.images = 0.8; }

  if (entityType === "event") {
    pick(meta, raw, fc, "start_date", ["event:start_time", "og:event:start_time"], 0.85);
    pick(meta, raw, fc, "end_date", ["event:end_time", "og:event:end_time"], 0.8);
  }

  if (entityType === "marketplace_item") {
    const price = parseFloat(meta.get("product:price:amount") || meta.get("og:price:amount") || "");
    if (Number.isFinite(price)) { raw.price = price; fc.price = 0.85; }
    const cur = meta.get("product:price:currency") || meta.get("og:price:currency");
    if (cur) raw.currency = cur;
  }

  if (entityType === "venue" || entityType === "stay" || entityType === "place") {
    pick(meta, raw, fc, "latitude", ["place:location:latitude", "og:latitude"], 0.85);
    pick(meta, raw, fc, "longitude", ["place:location:longitude", "og:longitude"], 0.85);
    if (typeof raw.latitude === "string") raw.latitude = parseFloat(raw.latitude as string);
    if (typeof raw.longitude === "string") raw.longitude = parseFloat(raw.longitude as string);
  }

  if (entityType === "news_article") {
    pick(meta, raw, fc, "published_at", ["article:published_time"], 0.85);
    pick(meta, raw, fc, "author", ["article:author"], 0.7);
    raw.summary = raw.description;
    delete raw.description;
  }

  if ((entityType === "venue" || entityType === "stay" || entityType === "place") && raw.title) {
    raw.name = raw.title;
    delete raw.title;
  }

  if (!raw.url) raw.url = sourceUrl;

  return {
    entity_type: entityType,
    raw_data: raw,
    confidence: 0.6,
    field_confidence: fc,
    extraction_method: "opengraph",
    source_url: sourceUrl,
  };
}

/**
 * Direct og:type → EntityType. Schema.org-compatible types only; anything
 * non-standard falls through to inferFromPlatform.
 */
export function mapOgType(t: string): EntityType | null {
  switch (t) {
    case "restaurant.restaurant":
    case "place":
    case "business.business":
      return "venue";
    case "hotel":
    case "lodging":
      return "stay";
    case "event":
    case "music.event":
      return "event";
    case "product":
    case "product.item":
    case "og:product":
      return "marketplace_item";
    case "article":
    case "news":
      return "news_article";
    default:
      return null;
  }
}

/**
 * Platform-aware fallback for the very common case of `og:type=website` —
 * Substack, Eventbrite, Bandcamp, Meetup, Etsy emit it on every page even
 * though each page is clearly a specific entity. Use the site name + URL
 * shape to recover the type. Narrow whitelist; the goal is to catch the 5
 * platforms users hit most, not to be a general-purpose URL classifier.
 */
export function inferFromPlatform(meta: MetaMap, sourceUrl: string): EntityType | null {
  const ogType = meta.get("og:type") || "";
  // Only fire when og:type is missing or generic — leave specific types alone.
  if (ogType && ogType !== "website" && ogType !== "object") return null;
  const site = (meta.get("og:site_name") || "").toLowerCase();
  const url = sourceUrl.toLowerCase();

  if (site.includes("substack") || /\.substack\.com\/p\//.test(url)) return "news_article";
  if (site.includes("medium") || /\bmedium\.com\/[^/]+\/[^/]+/.test(url)) return "news_article";
  if (site.includes("eventbrite") && /\/e\//.test(url)) return "event";
  if (site.includes("meetup") && /\/events?\//.test(url)) return "event";
  if (site.includes("bandcamp") && /\/(?:track|album)\//.test(url)) return "marketplace_item";
  if (site.includes("etsy") && /\/listing\//.test(url)) return "marketplace_item";
  if (site.includes("airbnb") && /\/rooms\//.test(url)) return "stay";
  return null;
}

function pick(
  meta: MetaMap,
  raw: Record<string, unknown>,
  fc: Record<string, number>,
  field: string,
  candidates: string[],
  confidence: number,
) {
  for (const c of candidates) {
    const v = meta.get(c);
    if (v) {
      raw[field] = v;
      fc[field] = confidence;
      return;
    }
  }
}
