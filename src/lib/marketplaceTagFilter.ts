/**
 * Splits the `?tags=` selection into the shapes the browse query needs.
 *
 * Semantics: OR within an axis, AND across axes — size-m + size-l means
 * "either size", size-m + color-black means "both". The old flat OR-union
 * made multi-axis refinement meaningless (adding a colour WIDENED results).
 *
 * - EVERY namespaced axis (size-, color-, mat-, occ-, vibe-, genre-, fit-)
 *   forms ONE tag group, junction-resolved server-side by
 *   marketplace_browse_page.
 * - Non-namespaced concept tags form one group together (legacy behaviour).
 *
 * SIZE AND COLOUR USED TO PUSH DOWN onto the generated `sizes` / `colors`
 * arrays instead — on the stated grounds that the columns "cover numeric
 * sizes that have no tag". Measured on prod 2026-10-09, those columns are
 * empty: `sizes` is non-empty on **0 of 70,961** listings and `colors` on
 * **159**, while the facet counts beside each chip are computed from the
 * tag JUNCTION. So the count and the filter read different sources, and
 * every size / colour chip was a dead end advertising a non-zero count —
 * 28 of the 58 chips on /marketplace/category/apparel, including the whole
 * size ladder. Routing them through the junction like every other axis is
 * what makes the chip agree with its own number (measured after: size-m
 * 2,460, color-black 1,119, both together 1,038 — AND across axes intact).
 *
 * `TagFilterSplit.sizes` / `.colors` are KEPT and stay empty: the RPC still
 * accepts those filters, so a future backfill of the generated columns can
 * re-enable the push-down by restoring the two branches below. Removing the
 * fields would make that a wider change than it needs to be.
 */

export interface TagFilterSplit {
  /** Bare size slugs for `.overlaps('sizes', …)` / the RPC sizes filter. */
  sizes: string[];
  /** Bare color slugs for `.overlaps('colors', …)` / the RPC colors filter. */
  colors: string[];
  /** Namespaced/concept slug groups: OR within a group, AND across groups. */
  tagGroups: string[][];
}

const AXIS_PREFIXES = ['size-', 'color-', 'mat-', 'occ-', 'vibe-', 'genre-', 'fit-'] as const;

export function splitTagSelections(slugs: string[] | undefined): TagFilterSplit {
  const sizes: string[] = [];
  const colors: string[] = [];
  const byPrefix = new Map<string, string[]>();
  const concepts: string[] = [];

  for (const slug of slugs ?? []) {
    const prefix = AXIS_PREFIXES.find((p) => slug.startsWith(p));
    if (prefix) {
      const group = byPrefix.get(prefix) ?? [];
      group.push(slug);
      byPrefix.set(prefix, group);
    } else {
      concepts.push(slug);
    }
  }

  const tagGroups = [...byPrefix.values()];
  if (concepts.length > 0) tagGroups.push(concepts);
  return { sizes, colors, tagGroups };
}

export function hasTagFilters(split: TagFilterSplit): boolean {
  return split.sizes.length > 0 || split.colors.length > 0 || split.tagGroups.length > 0;
}
