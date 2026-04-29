/**
 * Canonical JSON-LD extraction core. Used by both the in-page extractor
 * (extension/src/shared/extractors/jsonld.ts) and the worker /render
 * fallback (workers/submit/src/render.ts) — keeping the unwrap logic and
 * per-type field mapping in one place prevents the two from drifting.
 *
 * Pure functions only; no DOM API beyond a parsed JSON-LD value (an
 * unknown — we accept whatever JSON.parse handed us).
 *
 * Pipeline:
 *   parseLdJson(text)
 *     → resolveIdRefs(graph)   // dereference {"@id": "#x"} pointers
 *     → flatten(node)          // unwrap @graph, ItemList, subEvent, …
 *     → nodeToDetectedItem(node)  // schema → DetectedItem
 */

import { SCHEMA_TYPE_MAP, type EntityType } from "./entity-types";

export interface DetectedItem {
  entity_type: EntityType;
  raw_data: Record<string, unknown>;
  confidence: number;
  field_confidence?: Record<string, number>;
  extraction_method: "jsonld" | "opengraph" | "microdata" | "dom" | "manual";
  source_url: string;
}

export function parseLdJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Replace `{ "@id": "#foo" }` references with the actual node they point to,
 * and mark referenced nodes as "non-top-level" so they don't surface as
 * orphan items alongside the entity that owns them. Without this, an Event
 * with `location: {"@id": "#place1"}` plus a separate Place node ends up
 * as two unrelated items.
 *
 * Pure: walks a deep clone, returns a new tree.
 */
export function resolveIdRefs(input: unknown): unknown {
  const byId = new Map<string, Record<string, unknown>>();
  collectIds(input, byId);
  if (byId.size === 0) return input;

  // First pass: find every `{ "@id": "#x" }` pure reference. The set of
  // referenced ids tells us which nodes are "owned" by another node and
  // should not surface as orphan top-level items.
  const referenced = new Set<string>();
  collectRefs(input, referenced);

  // Second pass: walk the tree, replacing pure refs with their target,
  // and marking copies of referenced nodes so flatten() can drop them.
  return walk(input, byId, referenced, new Map());
}

function collectIds(node: unknown, byId: Map<string, Record<string, unknown>>) {
  if (Array.isArray(node)) { node.forEach((n) => collectIds(n, byId)); return; }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const id = obj["@id"];
  if (typeof id === "string" && Object.keys(obj).length > 1) byId.set(id, obj);
  for (const v of Object.values(obj)) collectIds(v, byId);
}

function collectRefs(node: unknown, refs: Set<string>) {
  if (Array.isArray(node)) { node.forEach((n) => collectRefs(n, refs)); return; }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 1 && keys[0] === "@id" && typeof obj["@id"] === "string") {
    refs.add(obj["@id"] as string);
    return;
  }
  for (const v of Object.values(obj)) collectRefs(v, refs);
}

function walk(
  node: unknown,
  byId: Map<string, Record<string, unknown>>,
  referenced: Set<string>,
  memo: Map<unknown, unknown>,
): unknown {
  if (Array.isArray(node)) return node.map((n) => walk(n, byId, referenced, memo));
  if (!node || typeof node !== "object") return node;
  const cached = memo.get(node);
  if (cached !== undefined) return cached;
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);
  // Pure ref: { "@id": "#x" } and nothing else → swap in a copy of the target.
  if (keys.length === 1 && keys[0] === "@id" && typeof obj["@id"] === "string") {
    const target = byId.get(obj["@id"] as string);
    if (target) {
      const resolved = walk(target, byId, referenced, memo);
      memo.set(node, resolved);
      return resolved;
    }
  }
  const out: Record<string, unknown> = {};
  // Pre-register the copy so cycles (and second visits) reuse the SAME marked object.
  memo.set(node, out);
  for (const k of keys) out[k] = walk(obj[k], byId, referenced, memo);
  const idVal = out["@id"];
  if (typeof idVal === "string" && referenced.has(idVal)) {
    out["__qg_ref_target"] = true;
  }
  return out;
}

/**
 * Flatten a JSON-LD tree into the set of nodes worth scanning. Naive
 * `@graph` unwrap is not enough: listing pages routinely use `ItemList` /
 * `CollectionPage` wrappers around the real entities, and Festival pages
 * put each performance under `subEvent`. Without these recursions a list
 * page returns one useless wrapper item instead of N concrete events.
 *
 * Nodes flagged `__qg_ref_target` (set by resolveIdRefs) are dropped to
 * avoid surfacing inlined sub-entities as duplicates.
 */
export function flatten(node: unknown): Record<string, unknown>[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  if (obj["__qg_ref_target"] === true) return [];

  if (Array.isArray(obj["@graph"])) {
    return (obj["@graph"] as unknown[]).flatMap(flatten);
  }

  if (Array.isArray(obj["itemListElement"])) {
    const out: Record<string, unknown>[] = [];
    for (const el of obj["itemListElement"] as unknown[]) {
      if (el && typeof el === "object") {
        const e = el as Record<string, unknown>;
        const inner = e["item"] ?? e;
        out.push(...flatten(inner));
      }
    }
    if (out.length) return out;
  }

  for (const key of ["subEvent", "subEvents", "mainEntity", "mainEntityOfPage", "hasPart"]) {
    const v = obj[key];
    if (Array.isArray(v) && v.length) return v.flatMap(flatten);
    if (v && typeof v === "object" && getTypeString(v as Record<string, unknown>).length) {
      const inner = flatten(v);
      if (inner.length) return [obj, ...inner.filter((n) => n !== obj)];
    }
  }

  return [obj];
}

export function getTypeString(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string");
  return [];
}

/**
 * Map a JSON-LD entity node onto a DetectedItem. Returns null if the node
 * doesn't carry a recognised Schema.org type. Handles every field the hub
 * `submissionRegistry` knows about — see [src/config/submissionRegistry.ts]
 * for the canonical field set per entity_type.
 */
export function nodeToDetectedItem(
  node: Record<string, unknown>,
  sourceUrl: string,
): DetectedItem | null {
  const types = getTypeString(node);
  const matchedType = types.map((t) => SCHEMA_TYPE_MAP[t]).find(Boolean);
  if (!matchedType) return null;

  const raw: Record<string, unknown> = {};
  const fc: Record<string, number> = {};

  copyString(node, raw, fc, "name");
  copyString(node, raw, fc, "description");
  copyString(node, raw, fc, "url");

  applyAddress(node["address"], raw, fc);
  applyGeo(node["geo"], raw, fc);
  applyImage(node["image"], raw, fc);

  if (matchedType === "venue" || matchedType === "place") {
    applyContactInfo(node, raw, fc);
  }
  if (matchedType === "event") applyEventFields(node, raw, fc);
  if (matchedType === "marketplace_item") applyProductFields(node, raw, fc);
  if (matchedType === "stay") applyLodgingFields(node, raw, fc);
  if (matchedType === "news_article") applyArticleFields(node, raw, fc);

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

// ── Field mappers ────────────────────────────────────────────────────────

function applyAddress(addr: unknown, raw: Record<string, unknown>, fc: Record<string, number>) {
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    if (typeof a.streetAddress === "string") raw.address = a.streetAddress;
    if (typeof a.addressLocality === "string") raw.city = a.addressLocality;
    if (typeof a.addressCountry === "string") {
      raw.country = a.addressCountry;
    } else if (a.addressCountry && typeof a.addressCountry === "object") {
      const c = a.addressCountry as Record<string, unknown>;
      if (typeof c.name === "string") raw.country = c.name;
    }
    if (typeof a.postalCode === "string") {
      raw.postal_code = a.postalCode;
      fc.postal_code = 0.9;
    }
    fc.address = 0.9;
  } else if (typeof addr === "string") {
    raw.address = addr;
    fc.address = 0.7;
  }
}

function applyGeo(geo: unknown, raw: Record<string, unknown>, fc: Record<string, number>) {
  if (!geo || typeof geo !== "object") return;
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

function applyImage(image: unknown, raw: Record<string, unknown>, fc: Record<string, number>) {
  const imgs = Array.isArray(image)
    ? image.flatMap(extractImageUrl)
    : extractImageUrl(image);
  if (imgs.length) {
    raw.images = Array.from(new Set(imgs));
    fc.images = 0.9;
  }
}

function extractImageUrl(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") {
    const u = (v as { url?: unknown; contentUrl?: unknown }).url ?? (v as { contentUrl?: unknown }).contentUrl;
    if (typeof u === "string") return [u];
  }
  return [];
}

/**
 * Phone / email / instagram for venues + places. `sameAs[]` is the canonical
 * Schema.org slot for social-media URLs; we filter for instagram.com because
 * that's what the hub registry asks for. Could be extended for facebook/x
 * later but keep narrow for now.
 */
function applyContactInfo(node: Record<string, unknown>, raw: Record<string, unknown>, fc: Record<string, number>) {
  if (typeof node.telephone === "string" && node.telephone.trim()) {
    raw.phone = node.telephone.trim();
    fc.phone = 0.9;
  }
  if (typeof node.email === "string" && node.email.includes("@")) {
    raw.email = node.email.trim();
    fc.email = 0.9;
  }
  if (typeof node.priceRange === "string" && node.priceRange.trim()) {
    raw.price_range = node.priceRange.trim();
    fc.price_range = 0.85;
  }
  const sameAs = node.sameAs;
  const urls = Array.isArray(sameAs)
    ? sameAs.filter((s): s is string => typeof s === "string")
    : typeof sameAs === "string" ? [sameAs] : [];
  const ig = urls.find((u) => /(?:^|\/\/)([a-z]+\.)*instagram\.com\//i.test(u));
  if (ig) {
    const handle = ig.match(/instagram\.com\/([^/?#]+)/i)?.[1];
    raw.instagram = handle ?? ig;
    fc.instagram = 0.85;
  }
}

function applyEventFields(node: Record<string, unknown>, raw: Record<string, unknown>, fc: Record<string, number>) {
  if (typeof node.startDate === "string") { raw.start_date = node.startDate; fc.start_date = 0.95; }
  if (typeof node.endDate === "string") { raw.end_date = node.endDate; fc.end_date = 0.9; }
  const loc = node["location"];
  if (loc && typeof loc === "object") {
    const l = loc as Record<string, unknown>;
    if (typeof l.name === "string") raw.venue_name = l.name;
    if (typeof l.url === "string") raw.venue_url = l.url;
    applyAddress(l.address, raw, fc);
  }
  const offers = node["offers"];
  const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
  if (offerList.length) {
    let min = Infinity;
    let max = -Infinity;
    let currency: string | undefined;
    let ticketUrl: string | undefined;
    let isFreeFlag = false;
    for (const offer of offerList) {
      if (!offer || typeof offer !== "object") continue;
      const o = offer as Record<string, unknown>;
      const price = parseFloat(String(o.price ?? ""));
      if (Number.isFinite(price)) {
        if (price === 0) isFreeFlag = true;
        if (price < min) min = price;
        if (price > max) max = price;
      }
      if (typeof o.priceCurrency === "string" && !currency) currency = o.priceCurrency;
      if (typeof o.url === "string" && !ticketUrl) ticketUrl = o.url;
    }
    if (Number.isFinite(min)) { raw.price_min = min; fc.price_min = 0.9; }
    if (Number.isFinite(max) && max !== min) { raw.price_max = max; fc.price_max = 0.9; }
    if (currency) raw.currency = currency;
    if (ticketUrl) { raw.ticket_url = ticketUrl; fc.ticket_url = 0.9; }
    if (isFreeFlag) raw.is_free = true;
  }
}

function applyProductFields(node: Record<string, unknown>, raw: Record<string, unknown>, fc: Record<string, number>) {
  const offers = node["offers"];
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (offer && typeof offer === "object") {
    const o = offer as Record<string, unknown>;
    const price = parseFloat(String(o.price ?? ""));
    if (Number.isFinite(price)) { raw.price = price; fc.price = 0.9; }
    if (typeof o.priceCurrency === "string") raw.currency = o.priceCurrency;
    if (o.shippingDetails != null) raw.shipping_available = true;
  }
  const brand = node["brand"];
  if (brand && typeof brand === "object" && typeof (brand as { name?: unknown }).name === "string") {
    raw.business_name = (brand as { name: string }).name;
    fc.business_name = 0.85;
  } else if (typeof brand === "string") {
    raw.business_name = brand;
    fc.business_name = 0.7;
  }
}

function applyLodgingFields(node: Record<string, unknown>, raw: Record<string, unknown>, fc: Record<string, number>) {
  if (typeof node.priceRange === "string") { raw.price_range = node.priceRange; fc.price_range = 0.85; }
  const amenities = node["amenityFeature"];
  const list = Array.isArray(amenities) ? amenities : amenities ? [amenities] : [];
  const names = list
    .map((a) => (a && typeof a === "object" ? (a as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === "string");
  if (names.length) {
    raw.amenities = names;
    fc.amenities = 0.85;
  }
}

function applyArticleFields(node: Record<string, unknown>, raw: Record<string, unknown>, fc: Record<string, number>) {
  if (typeof node.headline === "string") raw.title = node.headline;
  if (typeof node.description === "string") raw.summary = node.description;
  if (typeof node.datePublished === "string") raw.published_at = node.datePublished;
  const author = node["author"];
  if (author && typeof author === "object" && typeof (author as { name?: unknown }).name === "string") {
    raw.author = (author as { name: string }).name;
  } else if (typeof author === "string") {
    raw.author = author;
  }
  // Don't expose raw description twice — summary is the canonical field for news.
  delete raw.description;
  // articleBody is intentionally never copied (copyright).
  fc.author = raw.author ? 0.8 : 0;
  fc.published_at = raw.published_at ? 0.95 : 0;
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

/**
 * Top-level convenience: take raw JSON-LD text (or an already-parsed value),
 * resolve refs, flatten, map every node. Returns concrete DetectedItems and
 * the set of recognised + unrecognised @type strings (useful for diagnostics).
 */
export function extractFromJsonLd(
  input: unknown,
  sourceUrl: string,
): { items: DetectedItem[]; recognized: string[]; unrecognized: string[] } {
  const resolved = resolveIdRefs(input);
  const items: DetectedItem[] = [];
  const recognized: string[] = [];
  const unrecognized: string[] = [];
  for (const node of flatten(resolved)) {
    const types = getTypeString(node);
    const matched = types.find((t) => SCHEMA_TYPE_MAP[t]);
    if (matched) recognized.push(matched);
    else types.forEach((t) => unrecognized.push(t));
    const item = nodeToDetectedItem(node, sourceUrl);
    if (item) items.push(item);
  }
  return { items, recognized, unrecognized };
}
