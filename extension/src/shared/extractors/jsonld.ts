import { extractFromJsonLd, parseLdJson } from "@qg/sdk/jsonld-core";
import type { DetectedItem } from "../types";

/**
 * In-page wrapper around the canonical JSON-LD core (client-sdk/jsonld-core).
 * Walks every `<script type="application/ld+json">` block in the parsed
 * document, hands each to `extractFromJsonLd`, and concatenates the items.
 */
export function extractJsonLd(doc: Document, sourceUrl: string): DetectedItem[] {
  const blocks = doc.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  const items: DetectedItem[] = [];
  for (const block of Array.from(blocks)) {
    const parsed = parseLdJson(block.textContent || "");
    if (parsed == null) continue;
    const out = extractFromJsonLd(parsed, sourceUrl);
    items.push(...out.items);
  }
  return items;
}
