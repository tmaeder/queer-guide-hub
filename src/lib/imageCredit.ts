/**
 * Composing an image credit line.
 *
 * Lives outside the component module so it can be imported by a page without
 * exporting a non-component from one — the same reason `tagHygieneMetrics.ts`
 * sits apart from its panel.
 *
 * Until 2026-10-10 the only credit renderer in this repo was `CreditTag`, a
 * non-exported function inside `EditorialHero.tsx`, and every other surface
 * hand-rolled its own (`NewsDetail.tsx`'s figcaption, `InfographicSources`'
 * citation strip). A CC BY-SA photograph without a visible credit is a licence
 * breach rather than a styling preference, so the composition of that line is
 * worth exactly one implementation.
 */

export interface ImageCreditParts {
  /** Photographer or author, as the upstream gave it. */
  attribution?: string | null;
  /** Licence short name, e.g. "CC BY-SA 4.0". */
  license?: string | null;
  /** Where it came from, e.g. "wikimedia". */
  source?: string | null;
}

/** Human labels for the stored `image_source` vocabulary. */
const SOURCE_LABELS: Record<string, string> = {
  // Both point at Commons, because that is where the FILE lives — P18 is the
  // Wikidata claim that names it, not a second host.
  'wikidata:p18': 'via Wikimedia Commons',
  wikimedia: 'via Wikimedia Commons',
  pexels: 'via Pexels',
  unsplash: 'via Unsplash',
};

/**
 * Compose the credit line.
 *
 * Returns null when there is nothing to say — NOT an empty string, so a caller
 * cannot render an empty credit bar and read it as "credited".
 *
 * `source` is dropped when the licence text already names it: "Pexels License ·
 * via Pexels" is a tautology, while "CC BY-SA 4.0 · via Wikimedia Commons"
 * genuinely tells a reader where to go.
 */
export function formatImageCredit(parts: ImageCreditParts): string | null {
  const attribution = parts.attribution?.trim();
  const license = parts.license?.trim();
  const source = parts.source?.trim();

  const bits: string[] = [];
  if (attribution) bits.push(attribution);
  if (license) bits.push(license);
  if (source && !(license && license.toLowerCase().includes(source.toLowerCase()))) {
    bits.push(SOURCE_LABELS[source] ?? source);
  }
  return bits.length > 0 ? bits.join(' · ') : null;
}
