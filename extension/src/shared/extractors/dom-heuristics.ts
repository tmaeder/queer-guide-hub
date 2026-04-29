import type { DetectedItem, EntityType } from "../types";

const CURRENCY_SYMBOL: Record<string, string> = {
  "€": "EUR", "$": "USD", "£": "GBP", "CHF": "CHF",
  "¥": "JPY", "₹": "INR", "₽": "RUB", "₩": "KRW",
};

const PRICE_PATTERN = /(EUR|USD|GBP|CHF|JPY|INR|€|\$|£|¥|₹|₽|₩)\s?(\d{1,6}(?:[.,]\d{1,2})?)/i;
const ISO_DATE_PATTERN = /\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/;
const POSTCODE_PATTERN = /\b\d{4,5}\b\s+[A-ZÄÖÜ][\p{L}-]+/u;

/**
 * Last-resort DOM heuristics when no structured data is present. Pulls
 * a name from <h1> and tries to surface address, dates, and price/currency
 * via several DOM + text signals so even plain pages produce something
 * useful for the moderator to confirm.
 */
export function extractDomHeuristics(doc: Document, sourceUrl: string): DetectedItem[] {
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  if (!h1) return [];

  const raw: Record<string, unknown> = { name: h1, title: h1 };
  const fc: Record<string, number> = { name: 0.6 };

  pickAddress(doc, raw, fc);
  pickDate(doc, raw, fc);
  pickPrice(doc, raw, fc);
  pickContact(doc, raw, fc);

  const ogDesc = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content;
  if (ogDesc) raw.description = ogDesc;

  raw.url = sourceUrl;

  const entityType = inferEntityType(h1, raw, sourceUrl);
  if (!entityType) return [];

  return [
    {
      entity_type: entityType,
      raw_data: raw,
      confidence: 0.3,
      field_confidence: fc,
      extraction_method: "dom",
      source_url: sourceUrl,
    },
  ];
}

/**
 * Infer entity_type from the signals we just collected. Replaces the old
 * hardcoded `place` — emitting `place` for every plain page produced more
 * noise than value in admin moderation. Now we only emit when we have
 * actual evidence; otherwise return null so the page surfaces as
 * "nothing detected" and the user can use pick-selection or capture.
 *
 * Rules in priority order:
 *   - explicit hotel/lodging signals → stay
 *   - date + price → event
 *   - product noun in H1 + price → marketplace_item
 *   - postcode + no date → venue
 *   - bare postcode/address with no other signal → place
 *   - none of the above → null (drop)
 */
export function inferEntityType(
  h1: string,
  raw: Record<string, unknown>,
  sourceUrl: string,
): EntityType | null {
  const h1Lower = h1.toLowerCase();
  const url = sourceUrl.toLowerCase();
  const hasDate = typeof raw.start_date === "string";
  const hasPrice = typeof raw.price === "number";
  const hasAddress = typeof raw.address === "string";
  const hasContact = typeof raw.phone === "string" || typeof raw.email === "string";

  if (
    /\b(rooms?|check[- ]?in|suite|king bed|amenities|hostel|bed ?and ?breakfast)\b/i.test(h1Lower) ||
    /\/(?:hotels?|stays?|rooms?|lodging)\//i.test(url)
  ) {
    return "stay";
  }
  if (hasDate) return "event";
  if (hasPrice) return "marketplace_item";
  if (hasAddress) return "venue";
  if (hasContact) return "venue";
  return null;
}

function pickAddress(doc: Document, raw: Record<string, unknown>, fc: Record<string, number>) {
  const addr = doc.querySelector("address")?.textContent?.trim();
  if (addr) {
    raw.address = addr;
    fc.address = 0.5;
    return;
  }
  // Fallback: look for postcode + city pattern in the first ~3000 chars of body.
  const text = doc.body?.textContent?.slice(0, 3000) ?? "";
  const m = text.match(POSTCODE_PATTERN);
  if (m) {
    raw.address = m[0].trim();
    fc.address = 0.3;
  }
}

function pickDate(doc: Document, raw: Record<string, unknown>, fc: Record<string, number>) {
  const time = doc.querySelector<HTMLTimeElement>("time[datetime]");
  if (time?.dateTime) {
    raw.start_date = time.dateTime;
    fc.start_date = 0.6;
    return;
  }
  // Fallback: ISO date in the first 4000 chars of body.
  const text = doc.body?.textContent?.slice(0, 4000) ?? "";
  const m = text.match(ISO_DATE_PATTERN);
  if (m) {
    raw.start_date = m[0];
    fc.start_date = 0.35;
  }
}

function pickPrice(doc: Document, raw: Record<string, unknown>, fc: Record<string, number>) {
  const text = doc.body?.textContent?.slice(0, 5000) ?? "";
  const m = text.match(PRICE_PATTERN);
  if (!m) return;
  const symbol = m[1]!.toUpperCase();
  const currency = CURRENCY_SYMBOL[symbol] ?? CURRENCY_SYMBOL[m[1]!] ?? symbol;
  const numeric = parseFloat(m[2]!.replace(",", "."));
  if (Number.isFinite(numeric)) {
    raw.price = numeric;
    raw.currency = currency;
    fc.price = 0.4;
  }
}

function pickContact(doc: Document, raw: Record<string, unknown>, fc: Record<string, number>) {
  const tel = doc.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
  if (tel) {
    raw.phone = tel.getAttribute("href")!.replace(/^tel:/, "").trim();
    fc.phone = 0.85;
  }
  const mail = doc.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
  if (mail) {
    raw.email = mail.getAttribute("href")!.replace(/^mailto:/, "").trim();
    fc.email = 0.85;
  }
}
