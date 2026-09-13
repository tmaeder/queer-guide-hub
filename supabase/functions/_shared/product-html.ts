// Product-description text extraction for storefront importers (WooCommerce Store
// API, Shopify products.json). Pure — no IO.
//
// Three defects this exists to prevent, all measured on the dancesafe.org import:
//
//   1. `p.description || p.short_description` — a page-builder `description` is a
//      large HTML string that strips to EMPTY, but it is truthy, so the fallback
//      never fired. 58 of 112 products lost their prose. Decide on the STRIPPED
//      value, never on truthiness of the raw string (`pickProductDescription`).
//   2. A `<[^>]+>` tag strip removes `<style>`/`<script>` TAGS but keeps their
//      CONTENTS, so a stylesheet lands at the head of the description
//      (".vc_custom_1718…{background-color: …} IMPORTANT We've updated…").
//      65 rows across 5 merchants. Fixed by reusing the news sanitizer's
//      `stripHtmlTags`, which deletes raw-text elements with their contents.
//   3. Replacing every tag with a space splits words —
//      `<strong>u</strong><strong>pdated…` rendered as "u pdated". `stripHtmlTags`
//      separates block tags only; inline tags vanish silently.
//
// Plus: WordPress shortcodes survive tag stripping as literal text, and the raw
// JSON is double-encoded (`&amp;#8221;`), so decode→strip runs to a fixed point.

import { stripHtmlTags, decodeHtmlEntities } from './news-quality/sanitize.ts'

// A WordPress shortcode: `[name]`, `[name attr="x" /]`, `[/name]`. Attributes must
// be real `key=value` pairs — that is what keeps prose in brackets ("[see note]",
// "[0.01 g]") out of the match. Deliberately not limited to `vc_`/`mk_`: every
// page builder ships its own prefix.
const SHORTCODE =
  /\[\/?[a-z][a-z0-9_-]*(?:\s+[a-z0-9_:.-]+=(?:"[^"]*"|'[^']*'|[^\s\]"']*))*\s*\/?\]/gi

// Only strip tags when the text actually holds a `<…>` pair. `stripHtmlTags` treats
// any bare `<` as an opening tag and swallows to the next `>`, so a decoded
// comparison ("5 &lt; 10 mg" → "5 < 10 mg") would eat the rest of the sentence on
// the following pass.
const HAS_TAG = /<[^<>]{0,200}>/

/**
 * HTML/shortcode-free plain text for a product description.
 * Decode → strip → de-shortcode, repeated to a fixed point, then whitespace-collapsed.
 */
export function stripProductHtml(raw: unknown): string {
  let s = String(raw ?? '')
  if (!s) return ''
  for (let pass = 0; pass < 4; pass++) {
    const before = s
    if (HAS_TAG.test(s)) s = stripHtmlTags(s)
    s = decodeHtmlEntities(s).replace(SHORTCODE, ' ')
    if (s === before) break
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Pick a product description from the two fields storefronts expose, by comparing
 * the STRIPPED text — never `a || b`, which keeps a truthy layout-only blob and
 * discards the field that carries the prose.
 */
export function pickProductDescription(primary: unknown, fallback: unknown): string {
  const a = stripProductHtml(primary)
  const b = stripProductHtml(fallback)
  return b.length > a.length ? b : a
}
