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
/**
 * Commons `Artist` fields are HTML (`<a href=… title=…>Name</a>`), and some
 * upstream step strips only the angle brackets, leaving `a href="…" title="…"Name/a`.
 * Both shapes reduce to the visible name.
 */
export function stripCreditMarkup(text: string): string {
  let stripped = text;
  for (let prev = ''; prev !== stripped;) {
    prev = stripped;
    stripped = stripped.replace(/<[^>]*>/g, '');
  }
  // Commons wraps names in `<bdi><a …><span title="…">Name</span></a></bdi>`;
  // with the brackets stripped the openers run together ("bdia href=…span
  // title=…Name/span/a/bdi"), so `bdi`/`span` go alongside `a`.
  return stripped
    .replace(/(?<![\w])(?:bdi)?(?:a|span)\s+(?:[\w:-]+="[^"]*"\s*)+/g, ' ')
    .replace(/\/(?:a|span|bdi)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Longest credit that still reads as a caption rather than a notice. */
const CREDIT_CAPTION_MAX = 80;

export interface SplitImageCredit {
  /** The name to print, or null when none can be read out of the notice. */
  author: string | null;
  /** The full imported text when it is a notice too long for a caption. */
  notice: string | null;
}

/**
 * Some Commons authors put a first-person licensing notice in the Author field
 * ("This image is a work by … user C.Suthorn. When reusing, credit me as
 * described in the Licensing information below …"). Printed as a caption it
 * buries the page. Keep the name for the caption and hand back the notice so
 * the caller can show it behind a disclosure; never drop it.
 */
export function splitImageCredit(attribution: string | null | undefined): SplitImageCredit {
  const cleaned = attribution ? stripCreditMarkup(attribution) : '';
  if (!cleaned) return { author: null, notice: null };
  if (cleaned.length <= CREDIT_CAPTION_MAX && !/\n/.test(attribution ?? '')) {
    return { author: cleaned, notice: null };
  }
  const user = cleaned.match(/\buser\s+(\S+?)[.,;]?(?=\s|$)/i);
  return { author: user ? user[1] : null, notice: (attribution ?? '').trim() };
}

/** The Commons file page for an imported image, from its stored ids. */
export function commonsFileUrl(meta: {
  photographer_url?: string | null;
  source_id?: string | null;
}): string | null {
  const url = meta.photographer_url?.trim();
  if (url && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(url)) return url;
  const id = meta.source_id?.trim();
  if (id && /^File:[^/?#]+$/.test(id)) {
    return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(id.slice(5).replace(/ /g, '_'))}`;
  }
  return null;
}

export function formatImageCredit(parts: ImageCreditParts): string | null {
  const attribution = parts.attribution ? stripCreditMarkup(parts.attribution) : undefined;
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
