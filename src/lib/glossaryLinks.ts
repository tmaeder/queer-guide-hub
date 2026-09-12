/**
 * glossaryLinks — find the spans of body text that should link to a glossary
 * entry.
 *
 * This module is deliberately **pure and framework-free**: no React, no DOM, no
 * `supabase` import. It is imported by the SPA (`GlossaryLinkedText`) *and* by
 * the Cloudflare Pages edge builder (`functions/_lib/detail.ts`), which is a
 * separate tsconfig with only `@cloudflare/workers-types`. `functions/` already
 * reaches into `src/` this way for `brandTokens.ts`.
 *
 * **One implementation is load-bearing, not tidiness.** `docs/SEO.md`'s cloaking
 * rule requires the links served to a bot to be a *subset* of what a human sees.
 * Two matchers drift; one cannot.
 *
 * What this module does NOT decide: which terms are linkable at all. That is the
 * `glossary_link_terms` vocabulary, which is human-reviewed, because a string
 * that matches is not a term that is meant. Measured on prod before this
 * existed: matching every active tag name against 800 city descriptions linked
 * the tag literally named `A` on 747 of them, `Town` on 219, `River` on 152, and
 * put the *adult* tags `Middle`, `Public` and `Offering` into ordinary travel
 * copy. Same defect class as the alias auto-tagging incident that put `culture`
 * → **Crops** on 2,609 news articles (fixed in `20260910151200`).
 */

export type GlossaryMatchMode = 'exact' | 'exact_plural';

export type GlossaryLinkTerm = {
  /** The string matched in prose, e.g. "serodiscordant" or "chosen family". */
  surfaceForm: string;
  /** Slug of the glossary entry this term resolves to. */
  slug: string;
  /** Whether a trailing plural is also matched. */
  matchMode?: GlossaryMatchMode;
};

export type GlossaryLinkSpan = {
  /** Index into the input string. */
  start: number;
  /** Exclusive end index. */
  end: number;
  slug: string;
  /**
   * The exact source text matched — NEVER the vocabulary's surface form. The
   * reader's own casing and spelling stay on the page; substituting the
   * vocabulary's spelling would silently edit the prose.
   */
  label: string;
};

export type FindGlossaryLinksOptions = {
  /**
   * Slug of the glossary entry being rendered, when the host page is one. A
   * term never links to the page it is already on — the rule
   * `InfographicTermChip` established (current page → plain span).
   */
  currentSlug?: string | null;
  /** Hard cap on spans returned for one document. */
  maxLinks?: number;
};

/**
 * Wall-to-wall links read as spam and dilute every link on the page. Five is a
 * starting point, not a measured optimum.
 */
export const MAX_LINKS_PER_DOCUMENT = 5;

/**
 * A second line of defence under the human review, not a substitute for it.
 * The worst false positive measured on prod was a one-character tag (`A`,
 * `status='active'`, `seo_indexable=true`) that matched 93% of city
 * descriptions. Nothing shorter than this can link even if a row for it is
 * somehow activated.
 */
export const MIN_SURFACE_FORM_LENGTH = 3;

/**
 * Escape a literal for use inside a `u`-flagged RegExp.
 *
 * Only true metacharacters are escaped. `-` is deliberately NOT escaped: outside
 * a character class `\-` is an invalid identity escape under the `u` flag and
 * throws at construction time, which would take down every surface form
 * containing a hyphen (`2C-T-7`, `gay-friendly`, `PrEP-related`).
 */
function escapeRegExpLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Word-boundary assertions.
 *
 * `\b` is wrong here: it is defined against ASCII `[A-Za-z0-9_]`, so it fires in
 * the middle of any accented or non-Latin word, and it behaves unexpectedly for
 * surface forms that start or end with a digit or punctuation (`Section 28`,
 * `2C-T-7`). Unicode property escapes give the boundary we actually mean.
 * (The Postgres equivalent of this, for anything server-side, is `\y` — never
 * `\b`, which does not mean word boundary there at all.)
 */
const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';

/**
 * Build the alternative for a term that opted into plural matching.
 *
 * Only the three REGULAR English patterns are handled: consonant+`y` → `-ies`,
 * a sibilant ending → `-es`, otherwise `+s`. Irregulars (person/people,
 * index/indices) are deliberately not guessed — the vocabulary is curated row
 * by row and already supports several surface forms resolving to one slug, so
 * an irregular plural is a second reviewed row rather than a rule that is right
 * most of the time. A naive `(?:e?s)?` was the first attempt and it produced
 * "chosen familys", matching nothing a human would ever write.
 */
function pluralAlternative(surface: string): string {
  const lower = surface.toLowerCase();
  if (/[^aeiou]y$/.test(lower)) {
    return `${escapeRegExpLiteral(surface.slice(0, -1))}(?:y|ies)`;
  }
  if (/(?:s|sh|ch|x|z)$/.test(lower)) {
    return `${escapeRegExpLiteral(surface)}(?:es)?`;
  }
  return `${escapeRegExpLiteral(surface)}s?`;
}

type CompiledVocabulary = {
  regex: RegExp;
  /** Lowercased matched text → slug. */
  bySurface: Map<string, string>;
};

/**
 * Building a 1,000-alternative regex per document would be wasteful at the edge,
 * where one request renders several prose fields. The cache is keyed on the
 * vocabulary array identity, which both callers hold stable (TanStack Query
 * cache in the SPA, the in-isolate memo at the edge).
 */
const compiledCache = new WeakMap<readonly GlossaryLinkTerm[], CompiledVocabulary | null>();

function compile(vocabulary: readonly GlossaryLinkTerm[]): CompiledVocabulary | null {
  const usable = vocabulary.filter(
    (term) =>
      typeof term?.surfaceForm === 'string' &&
      typeof term?.slug === 'string' &&
      term.slug.trim().length > 0 &&
      term.surfaceForm.trim().length >= MIN_SURFACE_FORM_LENGTH,
  );
  if (usable.length === 0) return null;

  // Longest surface form first, so that at any given position the longest
  // alternative wins — JS alternation is leftmost-FIRST, not leftmost-longest,
  // so "chosen family" must precede "family" or the shorter term always claims
  // the position. The secondary sort keeps the built regex deterministic, which
  // is what lets the SPA and the edge be asserted byte-identical.
  const ordered = [...usable].sort(
    (a, b) =>
      b.surfaceForm.length - a.surfaceForm.length || (a.surfaceForm < b.surfaceForm ? -1 : 1),
  );

  const bySurface = new Map<string, string>();
  const alternatives: string[] = [];

  for (const term of ordered) {
    const surface = term.surfaceForm.trim();
    const key = surface.toLowerCase();
    // The vocabulary has a UNIQUE key on the normalised surface form, so this
    // is defensive: first (longest, then alphabetically first) wins.
    if (bySurface.has(key)) continue;
    bySurface.set(key, term.slug);

    alternatives.push(
      term.matchMode === 'exact_plural' ? pluralAlternative(surface) : escapeRegExpLiteral(surface),
    );
  }

  return {
    regex: new RegExp(`${BOUNDARY_BEFORE}(?:${alternatives.join('|')})${BOUNDARY_AFTER}`, 'giu'),
    bySurface,
  };
}

function compiledFor(vocabulary: readonly GlossaryLinkTerm[]): CompiledVocabulary | null {
  const cached = compiledCache.get(vocabulary);
  if (cached !== undefined) return cached;
  const built = compile(vocabulary);
  compiledCache.set(vocabulary, built);
  return built;
}

/**
 * Resolve a matched string back to a slug. A plural match ("chosen families")
 * is not in the map under its own spelling, so the inflection is undone — in
 * the same order `pluralAlternative` applies it, `-ies` first, or "families"
 * would be read as "familie" + s.
 *
 * This cannot mis-resolve an exact-only term: the regex never produces a plural
 * match for one, because the boundary assertion fails on the trailing letter.
 */
function slugForMatch(matched: string, bySurface: Map<string, string>): string | undefined {
  const key = matched.toLowerCase();
  const singulars = [
    key,
    key.endsWith('ies') ? `${key.slice(0, -3)}y` : null,
    key.endsWith('es') ? key.slice(0, -2) : null,
    key.endsWith('s') ? key.slice(0, -1) : null,
  ];
  for (const candidate of singulars) {
    if (candidate === null) continue;
    const slug = bySurface.get(candidate);
    if (slug) return slug;
  }
  return undefined;
}

/**
 * Find the spans of `text` that should become glossary links.
 *
 * Returned spans are non-overlapping and ordered by `start` ascending, so a
 * caller can splice them in with a single left-to-right pass.
 */
export function findGlossaryLinks(
  text: string,
  vocabulary: readonly GlossaryLinkTerm[],
  options: FindGlossaryLinksOptions = {},
): GlossaryLinkSpan[] {
  if (!text) return [];

  const compiled = compiledFor(vocabulary);
  if (!compiled) return [];

  const maxLinks = options.maxLinks ?? MAX_LINKS_PER_DOCUMENT;
  if (maxLinks <= 0) return [];
  const currentSlug = options.currentSlug?.toLowerCase() ?? null;

  const spans: GlossaryLinkSpan[] = [];
  // First mention only: a page that says "PrEP" nine times gets one link.
  const linked = new Set<string>();

  compiled.regex.lastIndex = 0;
  for (let match = compiled.regex.exec(text); match !== null; match = compiled.regex.exec(text)) {
    const label = match[0];
    // A zero-length match would spin the loop forever. Unreachable while every
    // alternative is a literal of at least MIN_SURFACE_FORM_LENGTH, but the
    // cost of being wrong about that is a hung render.
    if (label.length === 0) {
      compiled.regex.lastIndex += 1;
      continue;
    }

    const slug = slugForMatch(label, compiled.bySurface);
    if (!slug) continue;
    if (linked.has(slug)) continue;
    if (currentSlug && slug.toLowerCase() === currentSlug) continue;

    linked.add(slug);
    spans.push({ start: match.index, end: match.index + label.length, slug, label });
    if (spans.length >= maxLinks) break;
  }

  return spans;
}

/**
 * Split `text` into the alternating plain/link segments the spans describe.
 * Shared so the SPA renderer and the edge HTML builder cannot disagree about
 * how a span list becomes output.
 */
export type GlossarySegment =
  { kind: 'text'; text: string } | { kind: 'link'; text: string; slug: string };

export function segmentGlossaryText(
  text: string,
  vocabulary: readonly GlossaryLinkTerm[],
  options: FindGlossaryLinksOptions = {},
): GlossarySegment[] {
  const spans = findGlossaryLinks(text, vocabulary, options);
  if (spans.length === 0) return text ? [{ kind: 'text', text }] : [];

  const segments: GlossarySegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, span.start) });
    segments.push({ kind: 'link', text: span.label, slug: span.slug });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

/** The canonical href for a glossary entry. Mirrors `TagChip`'s `tagHref`. */
export function glossaryHref(slug: string): string {
  return `/tags/${encodeURIComponent(slug.toLowerCase())}`;
}
