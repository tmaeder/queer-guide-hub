import { SCHEMA_TYPE_MAP, type EntityType } from "@qg/sdk/entity-types";
import type { DetectedItem } from "../types";

/**
 * Microdata extractor (itemscope / itemtype / itemprop). Walks the DOM
 * scope-by-scope: each `itemscope` is an entity boundary, `itemprop`s are
 * collected only within their own scope, and a nested `itemscope` becomes
 * the **value** of its enclosing itemprop instead of leaking into the
 * parent's flat property bag.
 *
 * Confidence baseline 0.75 — slightly below JSON-LD because itemprop trees
 * are routinely sloppy (missing closes, ambiguous nesting), but the
 * scope-aware walker plus per-type field mapping (mirrors jsonld-core)
 * makes it considerably more useful than the previous flat first-occurrence
 * walker.
 *
 * Multi-value: when the same itemprop appears multiple times within a scope
 * (e.g. two `Offer` itemscopes on a single Restaurant), the value becomes
 * an array. Single-occurrence scalars stay scalar.
 */

type MicroNode = Record<string, unknown>;

export function extractMicrodata(doc: Document, sourceUrl: string): DetectedItem[] {
  const items: DetectedItem[] = [];
  const topScopes = Array.from(
    doc.querySelectorAll<HTMLElement>("[itemscope][itemtype]"),
  ).filter((el) => !hasItemscopeAncestor(el));

  for (const el of topScopes) {
    const entityType = mapType(el.getAttribute("itemtype") || "");
    if (!entityType) continue;
    const node = collectScope(el);
    const item = nodeToDetectedItem(entityType, node, sourceUrl);
    if (item) items.push(item);
  }
  return items;
}

function hasItemscopeAncestor(el: HTMLElement): boolean {
  let p = el.parentElement;
  while (p) {
    if (p.hasAttribute("itemscope")) return true;
    p = p.parentElement;
  }
  return false;
}

/**
 * Recursively collect every itemprop inside this scope. When we hit a
 * nested itemscope we recurse and emit it as a sub-object (so the parent
 * record reflects the actual document structure). Multiple values for the
 * same itemprop become arrays.
 */
function collectScope(scope: HTMLElement): MicroNode {
  const out: MicroNode = {};
  walk(scope, out);
  return out;
}

function walk(el: HTMLElement, out: MicroNode) {
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const propName = child.getAttribute("itemprop");
    if (propName && child.hasAttribute("itemscope")) {
      const sub = collectScope(child);
      assignProp(out, propName, sub);
    } else if (propName) {
      assignProp(out, propName, readPropValue(child));
    } else if (!child.hasAttribute("itemscope")) {
      // Plain wrapper element — descend looking for nested itemprops.
      walk(child, out);
    }
    // If it's an itemscope without an itemprop, it's an unrelated nested
    // entity (separate top-level scope) — skip; topScopes already covers it.
  }
}

function assignProp(out: MicroNode, key: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  const existing = out[key];
  if (existing === undefined) {
    out[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    out[key] = [existing, value];
  }
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

function mapType(itemtype: string): EntityType | null {
  const m = itemtype.match(/schema\.org\/(\w+)/i);
  if (!m) return null;
  const t = m[1] ?? "";
  return SCHEMA_TYPE_MAP[t] ?? null;
}

// ── Type → DetectedItem mapping ───────────────────────────────────────────

function nodeToDetectedItem(
  entityType: EntityType,
  node: MicroNode,
  sourceUrl: string,
): DetectedItem | null {
  const raw: Record<string, unknown> = {};
  copyString(node, raw, "name");
  copyString(node, raw, "description");
  copyString(node, raw, "url");

  applyAddress(node["address"], raw);
  applyGeo(node["geo"], raw);
  applyImage(node["image"], raw);

  if (entityType === "venue" || entityType === "place") applyContactInfo(node, raw);
  if (entityType === "event") applyEventFields(node, raw);
  if (entityType === "marketplace_item") applyProductFields(node, raw);
  if (entityType === "stay") applyLodgingFields(node, raw);
  if (entityType === "news_article") applyArticleFields(node, raw);

  if (Object.keys(raw).length === 0) return null;
  if (!raw.url) raw.url = sourceUrl;

  return {
    entity_type: entityType,
    raw_data: raw,
    confidence: 0.75,
    extraction_method: "microdata",
    source_url: sourceUrl,
  };
}

function applyAddress(addr: unknown, raw: Record<string, unknown>) {
  if (Array.isArray(addr)) addr = addr[0];
  if (addr && typeof addr === "object") {
    const a = addr as MicroNode;
    if (typeof a.streetAddress === "string") raw.address = a.streetAddress;
    if (typeof a.addressLocality === "string") raw.city = a.addressLocality;
    if (typeof a.addressCountry === "string") raw.country = a.addressCountry;
    if (typeof a.postalCode === "string") raw.postal_code = a.postalCode;
  } else if (typeof addr === "string") {
    raw.address = addr;
  }
}

function applyGeo(geo: unknown, raw: Record<string, unknown>) {
  if (Array.isArray(geo)) geo = geo[0];
  if (!geo || typeof geo !== "object") return;
  const g = geo as MicroNode;
  const lat = parseFloat(String(g.latitude ?? ""));
  const lng = parseFloat(String(g.longitude ?? ""));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    raw.latitude = lat;
    raw.longitude = lng;
  }
}

function applyImage(image: unknown, raw: Record<string, unknown>) {
  const list = Array.isArray(image) ? image : image ? [image] : [];
  const urls = list.flatMap(extractImageUrl);
  if (urls.length) raw.images = Array.from(new Set(urls));
}

function extractImageUrl(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") {
    const u = (v as { url?: unknown; contentUrl?: unknown }).url ?? (v as { contentUrl?: unknown }).contentUrl;
    if (typeof u === "string") return [u];
  }
  return [];
}

function applyContactInfo(node: MicroNode, raw: Record<string, unknown>) {
  if (typeof node.telephone === "string" && node.telephone.trim()) raw.phone = node.telephone.trim();
  if (typeof node.email === "string" && node.email.includes("@")) raw.email = node.email.trim();
  if (typeof node.priceRange === "string" && node.priceRange.trim()) raw.price_range = node.priceRange.trim();
  const sameAs = node.sameAs;
  const urls = Array.isArray(sameAs)
    ? sameAs.filter((s): s is string => typeof s === "string")
    : typeof sameAs === "string" ? [sameAs] : [];
  const ig = urls.find((u) => /(?:^|\/\/)([a-z]+\.)*instagram\.com\//i.test(u));
  if (ig) {
    const handle = ig.match(/instagram\.com\/([^/?#]+)/i)?.[1];
    raw.instagram = handle ?? ig;
  }
}

function applyEventFields(node: MicroNode, raw: Record<string, unknown>) {
  if (typeof node.startDate === "string") raw.start_date = node.startDate;
  if (typeof node.endDate === "string") raw.end_date = node.endDate;
  let loc = node["location"];
  if (Array.isArray(loc)) loc = loc[0];
  if (loc && typeof loc === "object") {
    const l = loc as MicroNode;
    if (typeof l.name === "string") raw.venue_name = l.name;
    if (typeof l.url === "string") raw.venue_url = l.url;
    applyAddress(l.address, raw);
  }
  applyOffersToEvent(node["offers"], raw);
}

function applyOffersToEvent(offers: unknown, raw: Record<string, unknown>) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  let min = Infinity;
  let max = -Infinity;
  let currency: string | undefined;
  let ticketUrl: string | undefined;
  let isFree = false;
  for (const offer of list) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as MicroNode;
    const price = parseFloat(String(o.price ?? ""));
    if (Number.isFinite(price)) {
      if (price === 0) isFree = true;
      if (price < min) min = price;
      if (price > max) max = price;
    }
    if (typeof o.priceCurrency === "string" && !currency) currency = o.priceCurrency;
    if (typeof o.url === "string" && !ticketUrl) ticketUrl = o.url;
  }
  if (Number.isFinite(min)) raw.price_min = min;
  if (Number.isFinite(max) && max !== min) raw.price_max = max;
  if (currency) raw.currency = currency;
  if (ticketUrl) raw.ticket_url = ticketUrl;
  if (isFree) raw.is_free = true;
}

function applyProductFields(node: MicroNode, raw: Record<string, unknown>) {
  let offers = node["offers"];
  if (Array.isArray(offers)) offers = offers[0];
  if (offers && typeof offers === "object") {
    const o = offers as MicroNode;
    const price = parseFloat(String(o.price ?? ""));
    if (Number.isFinite(price)) raw.price = price;
    if (typeof o.priceCurrency === "string") raw.currency = o.priceCurrency;
    if (o.shippingDetails != null) raw.shipping_available = true;
  }
  let brand = node["brand"];
  if (Array.isArray(brand)) brand = brand[0];
  if (brand && typeof brand === "object" && typeof (brand as { name?: unknown }).name === "string") {
    raw.business_name = (brand as { name: string }).name;
  } else if (typeof brand === "string") {
    raw.business_name = brand;
  }
}

function applyLodgingFields(node: MicroNode, raw: Record<string, unknown>) {
  if (typeof node.priceRange === "string") raw.price_range = node.priceRange;
  const amenities = node["amenityFeature"];
  const list = Array.isArray(amenities) ? amenities : amenities ? [amenities] : [];
  const names = list
    .map((a) => (a && typeof a === "object" ? (a as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === "string");
  if (names.length) raw.amenities = names;
}

function applyArticleFields(node: MicroNode, raw: Record<string, unknown>) {
  if (typeof node.headline === "string") raw.title = node.headline;
  if (typeof node.description === "string") raw.summary = node.description;
  if (typeof node.datePublished === "string") raw.published_at = node.datePublished;
  let author = node["author"];
  if (Array.isArray(author)) author = author[0];
  if (author && typeof author === "object" && typeof (author as { name?: unknown }).name === "string") {
    raw.author = (author as { name: string }).name;
  } else if (typeof author === "string") {
    raw.author = author;
  }
  delete raw.description;
}

function copyString(src: MicroNode, dst: Record<string, unknown>, key: string) {
  const v = src[key];
  if (typeof v === "string" && v.trim()) dst[key] = v.trim();
}
