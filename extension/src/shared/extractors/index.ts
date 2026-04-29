import { extractFromJsonLd, parseLdJson } from "@qg/sdk/jsonld-core";
import type { DetectedItem } from "../types";
import { extractDomHeuristics } from "./dom-heuristics";
import { extractJsonLd } from "./jsonld";
import { extractMicrodata } from "./microdata";
import { extractOpenGraph } from "./opengraph";

export interface ExtractDiagnostics {
  /** Number of <script type="application/ld+json"> blocks on the page. */
  jsonld_blocks: number;
  /** Schema.org @types we recognised and mapped to an entity_type. */
  jsonld_recognized_types: string[];
  /** Schema.org @types we saw but had no mapping for (e.g. `WebSite`). */
  jsonld_unrecognized_types: string[];
  /** og:type from <meta>, if any. */
  og_type: string | null;
  /** og:site_name from <meta>, if any. */
  og_site_name: string | null;
  /** Number of [itemscope] elements found. */
  microdata_scopes: number;
  /** Page <h1>, trimmed. */
  h1: string | null;
}

/**
 * Run all extractors and merge by (entity_type, normalized name, url) —
 * the highest-confidence variant wins, with lower-confidence fields
 * filling gaps. Tier order: jsonld > microdata > opengraph > dom.
 *
 * Returns both the items and a diagnostics object describing what each
 * extractor saw — used by the popup to show a "why was nothing detected?"
 * empty state instead of a blind "nothing detected".
 */
export function extractAll(
  doc: Document,
  sourceUrl: string,
): { items: DetectedItem[]; diagnostics: ExtractDiagnostics } {
  const diagnostics = collectDiagnostics(doc);
  const all = [
    ...extractJsonLd(doc, sourceUrl),
    ...extractMicrodata(doc, sourceUrl),
    ...extractOpenGraph(doc, sourceUrl),
  ];
  if (all.length === 0) {
    return { items: extractDomHeuristics(doc, sourceUrl), diagnostics };
  }
  return { items: mergeByEntity(all), diagnostics };
}

/**
 * Backwards-compatible alias for callers that don't care about diagnostics.
 * Discards the diagnostics field and returns only items.
 */
export function extractAllItems(doc: Document, sourceUrl: string): DetectedItem[] {
  return extractAll(doc, sourceUrl).items;
}

function collectDiagnostics(doc: Document): ExtractDiagnostics {
  const blocks = doc.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  const recognized: string[] = [];
  const unrecognized: string[] = [];
  for (const block of Array.from(blocks)) {
    const parsed = parseLdJson(block.textContent || "");
    if (parsed == null) continue;
    const out = extractFromJsonLd(parsed, "");
    recognized.push(...out.recognized);
    unrecognized.push(...out.unrecognized);
  }
  return {
    jsonld_blocks: blocks.length,
    jsonld_recognized_types: Array.from(new Set(recognized)),
    jsonld_unrecognized_types: Array.from(new Set(unrecognized)),
    og_type: doc.querySelector<HTMLMetaElement>('meta[property="og:type"]')?.content ?? null,
    og_site_name: doc.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content ?? null,
    microdata_scopes: doc.querySelectorAll("[itemscope]").length,
    h1: doc.querySelector("h1")?.textContent?.trim() || null,
  };
}

function mergeByEntity(items: DetectedItem[]): DetectedItem[] {
  const groups = new Map<string, DetectedItem[]>();
  for (const item of items) {
    const name = String(item.raw_data.name ?? item.raw_data.title ?? "").toLowerCase().trim();
    // Include url in the merge key. On listing pages many items can share
    // an entity_type with empty/duplicate names but distinct urls — without
    // the url they would collapse into a single junk row.
    const url = String(item.raw_data.url ?? "").toLowerCase().trim();
    const key = `${item.entity_type}|${name}|${url}`;
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }
  const merged: DetectedItem[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => b.confidence - a.confidence);
    const winner = arr[0]!;
    for (let i = 1; i < arr.length; i++) {
      for (const [k, v] of Object.entries(arr[i]!.raw_data)) {
        if (winner.raw_data[k] === undefined && v !== undefined && v !== "") {
          winner.raw_data[k] = v;
        }
      }
    }
    merged.push(winner);
  }
  return merged;
}
