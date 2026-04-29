/**
 * M6.2 — server-side fallback for pages where the in-page content_script
 * extractor finds nothing. Many SPA-rendered sites still emit JSON-LD via
 * SSR (Eventbrite, Booking.com, ra.co, …) so a plain fetch + regex over
 * <script type="application/ld+json"> blocks recovers them without
 * spinning up Browser Rendering.
 *
 * This intentionally only mirrors the JSON-LD extractor; it doesn't try
 * to do OG/microdata/heuristics. If JSON-LD isn't present the page is
 * truly client-rendered and we'd need puppeteer — out of scope for now.
 */

import type { DetectedItem, EntityType } from "./schema";

const FETCH_TIMEOUT_MS = 8000;

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

export async function renderAndExtract(url: string): Promise<DetectedItem[]> {
  const html = await fetchHtml(url);
  const blocks = extractJsonLdBlocks(html);
  const items: DetectedItem[] = [];
  for (const block of blocks) {
    const parsed = safeJsonParse(block);
    if (!parsed) continue;
    for (const node of flatten(parsed)) {
      const item = nodeToItem(node, url);
      if (item) items.push(item);
    }
  }
  return items;
}

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en;q=0.9,de;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractJsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1].trim());
  }
  return out;
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
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

function getTypeString(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string");
  return [];
}

function nodeToItem(node: Record<string, unknown>, sourceUrl: string): DetectedItem | null {
  const types = getTypeString(node);
  const matched = types.map((t) => TYPE_MAP[t]).find(Boolean);
  if (!matched) return null;

  const raw: Record<string, unknown> = {};
  copyString(node, raw, "name");
  copyString(node, raw, "description");
  copyString(node, raw, "url");

  const addr = node["address"];
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    if (typeof a.streetAddress === "string") raw.address = a.streetAddress;
    if (typeof a.addressLocality === "string") raw.city = a.addressLocality;
    if (typeof a.addressCountry === "string") raw.country = a.addressCountry;
  } else if (typeof addr === "string") {
    raw.address = addr;
  }

  const geo = node["geo"];
  if (geo && typeof geo === "object") {
    const g = geo as Record<string, unknown>;
    const lat = parseFloat(String(g.latitude ?? ""));
    const lng = parseFloat(String(g.longitude ?? ""));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      raw.latitude = lat;
      raw.longitude = lng;
    }
  }

  if (matched === "event") {
    if (typeof node.startDate === "string") raw.start_date = node.startDate;
    if (typeof node.endDate === "string") raw.end_date = node.endDate;
    const loc = node["location"];
    if (loc && typeof loc === "object" && typeof (loc as { name?: unknown }).name === "string") {
      raw.venue_name = (loc as { name: string }).name;
    }
  }

  if (matched === "marketplace_item") {
    const offers = node["offers"];
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (offer && typeof offer === "object") {
      const o = offer as Record<string, unknown>;
      const price = parseFloat(String(o.price ?? ""));
      if (Number.isFinite(price)) raw.price = price;
      if (typeof o.priceCurrency === "string") raw.currency = o.priceCurrency;
    }
  }

  if (matched === "news_article") {
    if (typeof node.headline === "string") raw.title = node.headline;
    if (typeof node.description === "string") raw.summary = node.description;
    if (typeof node.datePublished === "string") raw.published_at = node.datePublished;
    delete raw.description;
  }

  const image = node["image"];
  const imgs = Array.isArray(image)
    ? image.filter((i): i is string => typeof i === "string")
    : typeof image === "string"
    ? [image]
    : image && typeof image === "object" && typeof (image as { url?: unknown }).url === "string"
    ? [(image as { url: string }).url]
    : [];
  if (imgs.length) raw.images = imgs;

  if (!raw.url) raw.url = sourceUrl;

  return {
    entity_type: matched,
    raw_data: raw,
    confidence: 0.85,
    extraction_method: "jsonld",
    source_url: sourceUrl,
  };
}

function copyString(src: Record<string, unknown>, dst: Record<string, unknown>, key: string) {
  const v = src[key];
  if (typeof v === "string" && v.trim()) dst[key] = v.trim();
}
