import type { DetectedItem } from "../types";

/**
 * Last-resort DOM heuristics when no structured data is present. Confidence
 * is intentionally low (0.3) so the popup highlights it as "unsure". Pulls
 * a name from <h1>, address from <address>, dates from <time datetime>, and
 * price/currency via regex over the page text.
 *
 * Returns at most one item — heuristics cannot reliably distinguish entity
 * types without structured signals, so this returns a generic `place`-shaped
 * item that the user is asked to classify in the popup.
 */
export function extractDomHeuristics(doc: Document, sourceUrl: string): DetectedItem[] {
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  if (!h1) return [];

  const raw: Record<string, unknown> = { name: h1, title: h1 };
  const fc: Record<string, number> = { name: 0.6 };

  const addr = doc.querySelector("address")?.textContent?.trim();
  if (addr) {
    raw.address = addr;
    fc.address = 0.5;
  }

  const time = doc.querySelector<HTMLTimeElement>("time[datetime]");
  if (time?.dateTime) {
    raw.start_date = time.dateTime;
    fc.start_date = 0.5;
  }

  const ogDesc = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content;
  if (ogDesc) raw.description = ogDesc;

  // Price: first €/$/£ amount in body text. Heuristic, often wrong.
  const text = doc.body?.textContent?.slice(0, 5000) ?? "";
  const m = text.match(/(EUR|USD|GBP|CHF|€|\$|£)\s?(\d{1,5}([.,]\d{2})?)/);
  if (m) {
    raw.price_text = m[0];
    fc.price = 0.3;
  }

  raw.url = sourceUrl;

  return [
    {
      entity_type: "place",
      raw_data: raw,
      confidence: 0.3,
      field_confidence: fc,
      extraction_method: "dom",
      source_url: sourceUrl,
    },
  ];
}
