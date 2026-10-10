/**
 * Is this tag name a parse artifact rather than vocabulary?
 *
 * Why this exists: the only gate on the live mint path (`tags-ingestion` →
 * `pipeline-validate` → `pipeline-commit`) was `name.length >= 2`, which every
 * one of these clears, and the per-row entity-type cross-check short-circuits
 * because `expectedKindForTargetTable` has no `unified_tags` case. Zero
 * warnings means confidence 1.0, which clears the DAG's review gate. So the
 * glossary collected ISO locale codes scraped off venue and news rows (`Us`,
 * `Uk`, `Gb`, `Nz`, `Es`, `It`, `De`, `Cz`, `Tw`, `Lu`, `Ng`, `Mk`, `Mu`,
 * `Pe`), filter-facet labels minted as concepts (`All` on 2,643 rows, `Other`,
 * `No` on 129), and bare letters whose prose is about the alphabet.
 *
 * THE CASE OF A TWO-LETTER NAME IS THE WHOLE DISCRIMINATOR, and it is measured
 * rather than chosen. `normalize_tag_name`'s all-uppercase rung preserves a
 * genuine acronym, so a real one stays `TV` (662 uses) or `DJ` (52); a locale
 * code that arrived lowercase gets title-cased into `Gb`. Hence the shape test
 * is "two letters and NOT all-caps", and `TV`/`DJ` are positive controls in
 * every test of this module. An all-caps two-letter name is accepted even
 * though some are junk: without a vocabulary it is indistinguishable from an
 * acronym, and under-reaching is the correct error here — a wrongly rejected
 * term is lost vocabulary, a wrongly accepted one is caught by
 * `tag_hygiene_stats().junk_token_name_active`.
 *
 * Deliberately NOT a junk signal:
 *   - a bare number — `369` and `469` carry real definitions (group extensions
 *     of 69) and `80s-Themed`, `24-Hour`, `2C-B`, `3-MMC` are real terms;
 *   - having no definition — `LGBTIQ+` and `Activist` are real vocabulary that
 *     merely lacks prose. Absence of a definition is a writing backlog.
 *
 * Kept in step with the SQL counter by
 * `src/lib/__tests__/junkTokenNamePredicateParity.test.ts`, which reads the
 * live definition out of `supabase/migrations/`. Two implementations in two
 * languages cannot share code, so they share a test instead.
 */

/**
 * Names that are a filter-UI label or an answer value, never a concept.
 * Lower-case; matched case-insensitively.
 */
export const JUNK_TOKEN_STOPWORDS: readonly string[] = [
  'all',
  'other',
  'none',
  'various',
  'misc',
];

/** A single letter: `A` (Q9659, prose about the alphabet), `R`, `B`. */
const SINGLE_LETTER = /^[A-Za-z]$/;

/** Two letters that are not an all-caps acronym: `Gb`, `gb`, `gB` — never `TV`. */
const TWO_LETTER_NOT_ACRONYM = /^[A-Za-z]{2}$/;

/**
 * True when `name` cannot be a glossary term whatever prose it later gains.
 *
 * Evaluates the name as staged. A lower-case `gb` is rejected here because the
 * name normalizer would title-case it into the `Gb` the counter watches for.
 */
export function isJunkTokenTagName(name: string): boolean {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return false; // empty is E_MISSING_NAME's business, not ours
  if (SINGLE_LETTER.test(trimmed)) return true;
  if (TWO_LETTER_NOT_ACRONYM.test(trimmed) && trimmed !== trimmed.toUpperCase()) return true;
  return JUNK_TOKEN_STOPWORDS.includes(trimmed.toLowerCase());
}
