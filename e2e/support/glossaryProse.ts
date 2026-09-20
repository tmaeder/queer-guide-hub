/**
 * Strip the glossary auto-linker's anchors out of crawler HTML before a PROSE
 * assertion runs against it.
 *
 * WHY THIS EXISTS. `/tags/:slug` prose is rewritten on render so that any word
 * which is itself a glossary term becomes a link:
 *
 *     ... <a href="/tags/consent" data-glossary-link="consent">consent</a> to ...
 *
 * A phrase assertion against the raw HTML therefore breaks the day one of its
 * words becomes a tag — with the sentence still intact on the page and nothing
 * wrong with the content. Measured on prod 2026-09-19, three specs were red for
 * exactly this and only this:
 *
 *   /tags/stealthing  "consent to protected sex is not consent to unprotected sex"
 *   /tags/k-hole      "cannot consent to anything"
 *   /tags/doxy-pep    "cisgender women"
 *
 * All three sentences were published, correct and complete; `consent` and
 * `cisgender` had simply become linked terms since the specs were written.
 *
 * WHY IT REMOVES ONLY THESE ANCHORS, rather than stripping every tag. A blanket
 * tag strip also removes `<article>` boundaries, href values and attribute text,
 * which would weaken every NEGATIVE assertion in the same file — a check that
 * silently starts passing is worse than the red it replaced. Removing one
 * element class and keeping its inner text cannot add prose, so a positive
 * assertion can only go from wrongly-failing to passing, and a negative one
 * loses only text that was never prose.
 *
 * The non-greedy body is safe because glossary anchors are never nested —
 * `e2e/glossary-inline-links.spec.ts` asserts that directly, and that spec is
 * the one place this helper must NOT be used: it tests these anchors, so
 * removing them would gut it.
 *
 * Callers should keep a positive control that the raw HTML still carried
 * `data-glossary-link` at all. If the renderer ever renames the attribute this
 * helper becomes a silent no-op, and the phrase assertions go back to being
 * one glossary term away from red.
 */
export const GLOSSARY_LINK_ATTR = 'data-glossary-link';

export function unlinkGlossary(html: string): string {
  return html.replace(
    /<a\b[^>]*\bdata-glossary-link=[^>]*>([\s\S]*?)<\/a>/gi,
    '$1',
  );
}
