import { describe, expect, it } from 'vitest';
import { hasTagFilters, splitTagSelections } from '../marketplaceTagFilter';

describe('splitTagSelections', () => {
  // The regression this file exists for: size / colour used to push down onto
  // the generated `sizes` / `colors` columns, which are empty on prod (sizes 0
  // of 70,961 rows, colors 159), while the chip's own count comes from the tag
  // junction. Count and filter read different sources → every size and colour
  // chip returned 0 listings while advertising thousands.
  it('routes size through the junction, never the empty generated column', () => {
    const split = splitTagSelections(['size-m']);
    expect(split.sizes).toEqual([]);
    expect(split.tagGroups).toEqual([['size-m']]);
  });

  it('routes colour through the junction, never the empty generated column', () => {
    const split = splitTagSelections(['color-black']);
    expect(split.colors).toEqual([]);
    expect(split.tagGroups).toEqual([['color-black']]);
  });

  it('ORs within an axis and ANDs across axes', () => {
    const split = splitTagSelections(['size-m', 'size-l', 'color-black', 'mat-cotton']);
    // One group per axis: "either size" AND "black" AND "cotton".
    expect(split.tagGroups).toEqual([['size-m', 'size-l'], ['color-black'], ['mat-cotton']]);
  });

  it('keeps non-namespaced concept tags as one legacy group', () => {
    const split = splitTagSelections(['pride', 'handmade', 'vibe-bold']);
    expect(split.tagGroups).toEqual([['vibe-bold'], ['pride', 'handmade']]);
  });

  it('still reports a size-only selection as filtering', () => {
    // hasTagFilters gates entry to the marketplace_browse_page branch. A size
    // selection that no longer lands in `sizes` must still be seen as a filter,
    // or the whole selection is silently ignored by the unfiltered query below it.
    expect(hasTagFilters(splitTagSelections(['size-m']))).toBe(true);
    expect(hasTagFilters(splitTagSelections([]))).toBe(false);
    expect(hasTagFilters(splitTagSelections(undefined))).toBe(false);
  });
});
