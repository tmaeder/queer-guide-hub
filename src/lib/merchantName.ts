/**
 * A merchant's name, from its own listings — or null when the feed's value is
 * not usable as one.
 *
 * The merchant page used to title itself from the DOMAIN alone, which loses
 * the seller's own spelling: marekrichard.com became "Marekrichard" for a
 * shop that calls itself "Marek+Richard". `marketplace_merchants.display_name`
 * is not readable by anon (that table also holds API-key references), so the
 * public source is `business_name` on the merchant's listings — and that is
 * feed data, measured on prod:
 *
 *   marekrichard.com      → "Marek+Richard"                               (use)
 *   supergayunderwear.com → "SUPER GAY UNDERWEAR | Official Online Store" (cut the
 *                           store-title suffix)
 *   demask.com            → "demask.com"                                  (a domain,
 *                           not a name — reject and fall back)
 *
 * Returning null is the safe answer: the caller falls back to the domain-
 * derived label it always had, so a bad feed value can only cost polish,
 * never put junk in a heading.
 */
const SUFFIX = /\s+(?:\||–|—|-|·)\s+.*$/u;
const DOMAIN_LIKE = /^[\w.-]+\.[a-z]{2,}$/i;
const MAX_LEN = 48;

export function cleanMerchantName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').replace(SUFFIX, '').trim();
  if (!name) return null;
  if (DOMAIN_LIKE.test(name)) return null;
  if (name.length > MAX_LEN) return null;
  return name;
}

/** The most frequent usable name across a sample of listings. */
export function pickMerchantName(raws: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const r of raws) {
    const n = cleanMerchantName(r);
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [n, c] of counts) {
    if (c > bestN) {
      best = n;
      bestN = c;
    }
  }
  return best;
}
