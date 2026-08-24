/**
 * Splits the `?tags=` selection into the shapes the browse query needs.
 *
 * Semantics: OR within an axis, AND across axes — size-m + size-l means
 * "either size", size-m + color-black means "both". The old flat OR-union
 * made multi-axis refinement meaningless (adding a colour WIDENED results).
 *
 * - size-* / color-* strip to bare values and push down onto the GENERATED
 *   sizes/colors arrays (covers numeric sizes that have no tag).
 * - mat-* / occ-* / vibe- * / genre-* / fit-* each form ONE tag group
 *   (junction-resolved server-side by marketplace_browse_page).
 * - Non-namespaced concept tags form one group together (legacy behaviour).
 */

export interface TagFilterSplit {
  /** Bare size slugs for `.overlaps('sizes', …)` / the RPC sizes filter. */
  sizes: string[];
  /** Bare color slugs for `.overlaps('colors', …)` / the RPC colors filter. */
  colors: string[];
  /** Namespaced/concept slug groups: OR within a group, AND across groups. */
  tagGroups: string[][];
}

const AXIS_PREFIXES = ['mat-', 'occ-', 'vibe-', 'genre-', 'fit-'] as const;

export function splitTagSelections(slugs: string[] | undefined): TagFilterSplit {
  const sizes: string[] = [];
  const colors: string[] = [];
  const byPrefix = new Map<string, string[]>();
  const concepts: string[] = [];

  for (const slug of slugs ?? []) {
    if (slug.startsWith('size-')) {
      sizes.push(slug.slice('size-'.length));
      continue;
    }
    if (slug.startsWith('color-')) {
      colors.push(slug.slice('color-'.length));
      continue;
    }
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
