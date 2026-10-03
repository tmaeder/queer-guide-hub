import { decodeEntities } from './html-entities.ts'
/**
 * gay.ch category-link extraction.
 *
 * Split out of source-gay-ch/index.ts so it can be unit-tested: importing that
 * file runs `Deno.serve` at module load, which binds a port for the whole suite.
 * Same shape as gaybasel-parse.ts / kweer-parse.ts / milchjugend-parse.ts.
 *
 * WHAT WAS WRONG. The extractor was
 *
 *   [...html.matchAll(/class="link-category"[^>]*>([\s\S]*?)<\/a>/g)]
 *     .map((m) => stripTags(m[1]))
 *
 * and every value it produced on prod was attribute soup, not a label:
 *
 *   class="link-category" rel="nofollow">Zürich      2,699 rows
 *   class="link-category" rel="nofollow">Heaven        964
 *   class="link-category" rel="nofollow">Bern          474
 *
 * Two independent faults compose to make that:
 *
 *  1. The pattern is anchored on the bare ATTRIBUTE TEXT `class="link-category"`,
 *     not on an `<a>` element, so it will start matching inside an attribute
 *     value, a data- payload or a script blob — anywhere that string appears.
 *     `<a\b[^>]*` fixes that: a match must begin at a real anchor tag.
 *
 *  2. `stripTags` removes tags BEFORE decoding entities (index.ts:64 strips,
 *     :68-71 then turns &quot; into " and &gt; into >). So markup that arrives
 *     entity-encoded is invisible to the strip and is *revealed* by the decode,
 *     one step too late to be removed. Decoding first and stripping after is the
 *     order that terminates.
 *
 * MEASURED BLAST RADIUS, so the next reader does not over- or under-estimate it:
 * the soup reached `event_sources.payload.metadata.keywords` only. Across all
 * 3,876 gay-ch events, `events.tags` holds clean curated vocabulary (gay, drag,
 * kink, queer, trans, …), `unified_tags` has zero rows matching it, and no title
 * or description carries it. Nothing rendered was wrong; the stored provenance
 * was.
 */

/* Entity decoding is shared with source-gay-ch's stripTags via
 * _shared/html-entities.ts — see the import at the top of this file. It is
 * still applied BEFORE tag removal here, which is deliberate for this parser:
 * gay.ch encodes angle brackets inside category labels and they must survive
 * as text rather than be read as markup. */

/**
 * Residual markup in a finished label. A category name is a place or a festival
 * — "Zürich", "Street Parade", "Lila - Queer Festival" — never something
 * carrying angle brackets or an HTML attribute.
 *
 * This is a REFUSAL, not a repair: a value that still looks like markup after
 * decoding and stripping is dropped rather than stored. Absence of a keyword is
 * honest and self-correcting; a stored `class="link-category" rel="nofollow">Zürich`
 * is a fact the corpus now has to carry, and it sat in 2,699 rows.
 */
const LOOKS_LIKE_MARKUP = /[<>]|\b(?:class|rel|href|style|data-[\w-]+)\s*=/i

export function extractCategoryKeywords(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bclass="link-category"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => decodeEntities(m[1]))
    // Strip AFTER decoding, so markup the decode just revealed is still removed.
    .map((s) => s.replace(/<[^>]+>/g, ' '))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0 && !LOOKS_LIKE_MARKUP.test(s))
}
