import type { DetectedItem, EntityType } from "../types";

/**
 * Microdata extractor (itemscope / itemtype / itemprop). Produces the same
 * shape as the JSON-LD extractor; reuses the same Schema.org type → entity
 * mapping. Confidence baseline 0.75 — slightly below JSON-LD because itemprop
 * trees are routinely sloppy (missing closes, ambiguous nesting).
 */

const TYPE_MAP: Record<string, EntityType> = {
  Event: "event",
  MusicEvent: "event",
  Restaurant: "venue",
  BarOrPub: "venue",
  NightClub: "venue",
  LocalBusiness: "venue",
  Hotel: "stay",
  LodgingBusiness: "stay",
  Product: "marketplace_item",
  NewsArticle: "news_article",
  Article: "news_article",
  Place: "place",
};

export function extractMicrodata(doc: Document, sourceUrl: string): DetectedItem[] {
  const scopes = doc.querySelectorAll<HTMLElement>("[itemscope][itemtype]");
  const items: DetectedItem[] = [];
  for (const scope of Array.from(scopes)) {
    const entityType = mapType(scope.getAttribute("itemtype") || "");
    if (!entityType) continue;
    const raw: Record<string, unknown> = {};
    for (const prop of Array.from(scope.querySelectorAll<HTMLElement>("[itemprop]"))) {
      const key = prop.getAttribute("itemprop");
      if (!key || raw[key] !== undefined) continue;
      raw[key] = readPropValue(prop);
    }
    if (Object.keys(raw).length === 0) continue;
    items.push({
      entity_type: entityType,
      raw_data: raw,
      confidence: 0.75,
      extraction_method: "microdata",
      source_url: sourceUrl,
    });
  }
  return items;
}

function mapType(itemtype: string): EntityType | null {
  // schema.org URLs end in /TypeName.
  const m = itemtype.match(/schema\.org\/(\w+)/i);
  if (!m) return null;
  const t = m[1] ?? "";
  return TYPE_MAP[t] ?? null;
}

function readPropValue(el: HTMLElement): string {
  if (el instanceof HTMLMetaElement) return el.content;
  if (el instanceof HTMLImageElement) return el.src;
  if (el instanceof HTMLAnchorElement || el instanceof HTMLAreaElement) return el.href;
  if (el instanceof HTMLLinkElement) return el.href;
  if (el instanceof HTMLObjectElement) return el.data;
  if (el instanceof HTMLDataElement) return el.value;
  if (el instanceof HTMLTimeElement) return el.dateTime || el.textContent?.trim() || "";
  const content = el.getAttribute("content");
  if (content) return content;
  return el.textContent?.trim() || "";
}
