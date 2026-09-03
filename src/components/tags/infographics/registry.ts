/**
 * The figure registry, and the reverse index derived from it.
 *
 * **Only metadata is imported here.** Renderers and geometry sit behind each
 * meta's lazy `load()`, which does two jobs: it keeps ~10 KB of bezier data
 * per figure out of the eager chunk that `check-bundle-shape.mjs` caps, and it
 * makes `figuresForSlug(...).length` knowable on first render. That second
 * one is load-bearing on TagDetail — the `#figure` RouteStrip station is
 * pushed from this count, and a station that appears after a lazy chunk
 * resolves would point at nothing in between.
 *
 * The binding lives on the FIGURE, never on the tag: one figure teaches many
 * terms and a term may host more than one. Nothing about this is in the
 * database. A DB-side model would need its own i18n map (bypassing
 * `i18n:check` and the German-defaults guard), a migration per figure, and
 * would make the `/tags` "has a diagram" facet an async lookup instead of a
 * `Set.has`. `src/lib/rights/rightsCatalog.ts` is the same call, made before.
 */

import type { InfographicMeta, Teaches } from './types';
import { fourLinesMeta } from './figures/fourLines/meta';
import { consentFlowMeta } from './figures/consentFlow/meta';

/** Declaration order is the tie-break wherever two figures rank equally. */
export const INFOGRAPHICS: readonly InfographicMeta[] = [fourLinesMeta, consentFlowMeta];

export const INFOGRAPHICS_BY_ID: ReadonlyMap<string, InfographicMeta> = new Map(
  INFOGRAPHICS.map((f) => [f.id, f]),
);

/** How many inline bands a single term may host before the rest become links. */
export const MAX_INLINE_FIGURES = 2;

function roleFor(figure: InfographicMeta, slug: string): Teaches['role'] | undefined {
  return figure.teaches.find((x) => x.slug === slug)?.role;
}

/**
 * slug → figures that put it IN the picture. `mentioned` is excluded on
 * purpose: a term named in a legend has not been taught by the diagram, and
 * rendering a 400px interactive on its page would be a lie about relevance.
 */
export const FIGURES_BY_SLUG: ReadonlyMap<string, readonly InfographicMeta[]> = (() => {
  const map = new Map<string, InfographicMeta[]>();
  for (const figure of INFOGRAPHICS) {
    for (const teach of figure.teaches) {
      if (teach.role === 'mentioned') continue;
      const list = map.get(teach.slug) ?? [];
      list.push(figure);
      map.set(teach.slug, list);
    }
  }
  // `subject` first — a figure's canonical home leads on its own page — then
  // declaration order, which `Array.prototype.sort` preserves for ties.
  for (const [slug, list] of map) {
    map.set(
      slug,
      list.sort((a, b) => {
        const rank = (f: InfographicMeta) => (roleFor(f, slug) === 'subject' ? 0 : 1);
        return rank(a) - rank(b);
      }),
    );
  }
  return map;
})();

/** slug → figures that merely NAME it. Renders as one rail line, never a band. */
export const MENTIONS_BY_SLUG: ReadonlyMap<string, readonly InfographicMeta[]> = (() => {
  const map = new Map<string, InfographicMeta[]>();
  for (const figure of INFOGRAPHICS) {
    for (const teach of figure.teaches) {
      if (teach.role !== 'mentioned') continue;
      const list = map.get(teach.slug) ?? [];
      list.push(figure);
      map.set(teach.slug, list);
    }
  }
  return map;
})();

export function figuresForSlug(slug: string | null | undefined): readonly InfographicMeta[] {
  if (!slug) return [];
  return FIGURES_BY_SLUG.get(slug) ?? [];
}

export function mentionsForSlug(slug: string | null | undefined): readonly InfographicMeta[] {
  if (!slug) return [];
  return MENTIONS_BY_SLUG.get(slug) ?? [];
}

/** The `/tags` facet predicate. Synchronous by design — the index page filters
 *  ~3,700 rows on every keystroke and cannot afford a lookup that isn't. */
export function hasFigure(slug: string | null | undefined): boolean {
  return figuresForSlug(slug).length > 0;
}

/** Every slug any figure references, in any role. The resolver's fetch list. */
export function allReferencedSlugs(figures: readonly InfographicMeta[]): string[] {
  return [...new Set(figures.flatMap((f) => f.teaches.map((x) => x.slug)))];
}
