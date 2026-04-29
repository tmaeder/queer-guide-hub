import { buildOgItem, type MetaMap } from "@qg/sdk/og-core";
import type { DetectedItem } from "../types";

/**
 * In-page wrapper around the canonical OpenGraph/Twitter core
 * (client-sdk/og-core). Reads `<meta property/name=… content=…>` into a
 * Map and hands it to the shared mapper. Lower confidence than JSON-LD
 * because OG types are coarse — `og:type=article` could be news or a
 * generic blog post.
 */
export function extractOpenGraph(doc: Document, sourceUrl: string): DetectedItem[] {
  const meta = readMeta(doc);
  const item = buildOgItem(meta, sourceUrl);
  return item ? [item] : [];
}

function readMeta(doc: Document): MetaMap {
  const m: MetaMap = new Map();
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
