import type { DetectedItem } from "../types";
import { extractDomHeuristics } from "./dom-heuristics";
import { extractJsonLd } from "./jsonld";
import { extractMicrodata } from "./microdata";
import { extractOpenGraph } from "./opengraph";

/**
 * Run all extractors and merge by (entity_type, normalized name) — the
 * highest-confidence variant wins, with lower-confidence fields filling
 * gaps. Tier order: jsonld > microdata > opengraph > dom.
 */
export function extractAll(doc: Document, sourceUrl: string): DetectedItem[] {
  const all = [
    ...extractJsonLd(doc, sourceUrl),
    ...extractMicrodata(doc, sourceUrl),
    ...extractOpenGraph(doc, sourceUrl),
  ];
  if (all.length === 0) {
    return extractDomHeuristics(doc, sourceUrl);
  }
  return mergeByEntity(all);
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
