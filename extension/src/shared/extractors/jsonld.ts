import type { DetectedItem, EntityType } from "../types";

/**
 * Extract structured items from JSON-LD blocks. Schema.org coverage is the
 * single highest-value signal a webpage can give us; if a site emits JSON-LD
 * we trust it heavily (confidence 0.9 baseline). Multi-item @graph arrays
 * and nested types are flattened.
 */
export function extractJsonLd(doc: Document, sourceUrl: string): DetectedItem[] {
  const blocks = doc.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  const items: DetectedItem[] = [];
  for (const block of Array.from(blocks)) {
    const parsed = safeParse(block.textContent || "");
    if (!parsed) continue;
    for (const node of flatten(parsed)) {
      const item = nodeToItem(node, sourceUrl);
      if (item) items.push(item);
    }
  }
  return items;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function flatten(node: unknown): Record<string, unknown>[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    return (obj["@graph"] as unknown[]).flatMap(flatten);
  }
  return [obj];
}

const TYPE_MAP: Record<string, EntityType> = {
  Event: "event",
  MusicEvent: "event",
  Festival: "event",
  TheaterEvent: "event",
  ComedyEvent: "event",
  SocialEvent: "event",
  Restaurant: "venue",
  BarOrPub: "venue",
  NightClub: "venue",
  CafeOrCoffeeShop: "venue",
  LocalBusiness: "venue",
  Hotel: "stay",
  LodgingBusiness: "stay",
  BedAndBreakfast: "stay",
  Hostel: "stay",
  Resort: "stay",
  Product: "marketplace_item",
  NewsArticle: "news_article",
  Article: "news_article",
  BlogPosting: "news_article",
  Organization: "organization",
  NGO: "organization",
  Place: "place",
  TouristAttraction: "place",
};

function getTypeString(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string");
  return [];
}

function nodeToItem(node: Record<string, unknown>, sourceUrl: string): DetectedItem | null {
  const types = getTypeString(node);
  const matchedType = types.map((t) => TYPE_MAP[t]).find(Boolean);
  if (!matchedType) return null;

  const raw: Record<string, unknown> = {};
  const fc: Record<string, number> = {};

  copyString(node, raw, fc, "name");
  copyString(node, raw, fc, "description");
  copyString(node, raw, fc, "url");

  // Address
  const addr = node["address"];
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    if (typeof a.streetAddress === "string") raw.address = a.streetAddress;
    if (typeof a.addressLocality === "string") raw.city = a.addressLocality;
    if (typeof a.addressCountry === "string") raw.country = a.addressCountry;
    fc.address = 0.9;
  } else if (typeof addr === "string") {
    raw.address = addr;
    fc.address = 0.7;
  }

  // Geo
  const geo = node["geo"];
  if (geo && typeof geo === "object") {
    const g = geo as Record<string, unknown>;
    const lat = parseFloat(String(g.latitude ?? ""));
    const lng = parseFloat(String(g.longitude ?? ""));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      raw.latitude = lat;
      raw.longitude = lng;
      fc.latitude = 0.95;
      fc.longitude = 0.95;
    }
  }

  // Event-specific
  if (matchedType === "event") {
    if (typeof node.startDate === "string") {
      raw.start_date = node.startDate;
      fc.start_date = 0.95;
    }
    if (typeof node.endDate === "string") {
      raw.end_date = node.endDate;
      fc.end_date = 0.9;
    }
    const loc = node["location"];
    if (loc && typeof loc === "object") {
      const l = loc as Record<string, unknown>;
      if (typeof l.name === "string") raw.venue_name = l.name;
    }
  }

  // Product / marketplace
  if (matchedType === "marketplace_item") {
    const offers = node["offers"];
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (offer && typeof offer === "object") {
      const o = offer as Record<string, unknown>;
      const price = parseFloat(String(o.price ?? ""));
      if (Number.isFinite(price)) {
        raw.price = price;
        fc.price = 0.9;
      }
      if (typeof o.priceCurrency === "string") raw.currency = o.priceCurrency;
    }
  }

  // Article-specific — never copy articleBody verbatim (copyright).
  if (matchedType === "news_article") {
    if (typeof node.headline === "string") raw.title = node.headline;
    if (typeof node.description === "string") raw.summary = node.description;
    if (typeof node.datePublished === "string") raw.published_at = node.datePublished;
    const author = node["author"];
    if (author && typeof author === "object" && typeof (author as { name?: unknown }).name === "string") {
      raw.author = (author as { name: string }).name;
    } else if (typeof author === "string") {
      raw.author = author;
    }
    delete raw.description; // collapsed into summary
  }

  // Image(s)
  const image = node["image"];
  const imgs = Array.isArray(image)
    ? image.filter((i): i is string => typeof i === "string")
    : typeof image === "string"
    ? [image]
    : image && typeof image === "object" && typeof (image as { url?: unknown }).url === "string"
    ? [(image as { url: string }).url]
    : [];
  if (imgs.length) {
    raw.images = imgs;
    fc.images = 0.9;
  }

  if (!raw.url) raw.url = sourceUrl;

  return {
    entity_type: matchedType,
    raw_data: raw,
    confidence: 0.9,
    field_confidence: fc,
    extraction_method: "jsonld",
    source_url: sourceUrl,
  };
}

function copyString(
  src: Record<string, unknown>,
  dst: Record<string, unknown>,
  fc: Record<string, number>,
  key: string,
) {
  const v = src[key];
  if (typeof v === "string" && v.trim()) {
    dst[key] = v.trim();
    fc[key] = 0.95;
  }
}
