import type { DetectedItem, EntityType } from "../types";

/**
 * OpenGraph + Twitter card fallback when no JSON-LD is present. Lower
 * confidence than JSON-LD because OG types are coarse — `og:type=article`
 * could be a news piece or a blog post about anything.
 */
export function extractOpenGraph(doc: Document, sourceUrl: string): DetectedItem[] {
  const meta = readMeta(doc);
  if (!meta.size) return [];

  const ogType = meta.get("og:type") || "";
  const entityType = mapOgType(ogType);
  if (!entityType) return [];

  const raw: Record<string, unknown> = {};
  const fc: Record<string, number> = {};

  pick(meta, raw, fc, "title", ["og:title", "twitter:title"], 0.85);
  pick(meta, raw, fc, "description", ["og:description", "twitter:description", "description"], 0.7);
  pick(meta, raw, fc, "url", ["og:url"], 0.9);
  pick(meta, raw, fc, "site_name", ["og:site_name"], 0.8);

  const image = meta.get("og:image") || meta.get("twitter:image");
  if (image) {
    raw.images = [image];
    fc.images = 0.8;
  }

  if (entityType === "event") {
    pick(meta, raw, fc, "start_date", ["event:start_time", "og:event:start_time"], 0.85);
    pick(meta, raw, fc, "end_date", ["event:end_time", "og:event:end_time"], 0.8);
  }

  if (entityType === "marketplace_item") {
    const price = parseFloat(meta.get("product:price:amount") || meta.get("og:price:amount") || "");
    if (Number.isFinite(price)) {
      raw.price = price;
      fc.price = 0.85;
    }
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

  // Map title field to either `name` (venues/places) or keep as `title`.
  if ((entityType === "venue" || entityType === "stay" || entityType === "place") && raw.title) {
    raw.name = raw.title;
    delete raw.title;
  }

  if (!raw.url) raw.url = sourceUrl;

  return [
    {
      entity_type: entityType,
      raw_data: raw,
      confidence: 0.6,
      field_confidence: fc,
      extraction_method: "opengraph",
      source_url: sourceUrl,
    },
  ];
}

function readMeta(doc: Document): Map<string, string> {
  const m = new Map<string, string>();
  for (const tag of Array.from(doc.querySelectorAll("meta"))) {
    const key =
      tag.getAttribute("property") ||
      tag.getAttribute("name") ||
      tag.getAttribute("itemprop");
    const value = tag.getAttribute("content");
    if (key && value && !m.has(key)) m.set(key, value);
  }
  return m;
}

function mapOgType(t: string): EntityType | null {
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

function pick(
  meta: Map<string, string>,
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
