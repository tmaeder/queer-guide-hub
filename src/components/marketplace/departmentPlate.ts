import type { TransitIconName } from '@/components/transit/transitIconPaths';

/**
 * Which mark stands for each department.
 *
 * Four of these reuse marks the icon set already had rather than drawing a
 * near-duplicate: `library` for Books & Art, `collar` for BDSM & Fetish,
 * `community` for Services and `shop` for the Other bucket. The other seven
 * were drawn for this (see the department block in `transitIconPaths.ts`).
 *
 * `other` is present even though the hub's stop list filters it out — the
 * department PAGE renders for `/marketplace/category/other` and would
 * otherwise have no mark, and `departmentGlyph` needs a total function anyway.
 */
export const DEPARTMENT_GLYPHS: Record<string, TransitIconName> = {
  apparel: 'apparel',
  underwear: 'underwear',
  swimwear: 'swimwear',
  jewelry: 'jewelry',
  books_art: 'library',
  home: 'homeware',
  hygiene: 'selfcare',
  intimacy: 'intimacy',
  bdsm_fetish: 'collar',
  services: 'community',
  other: 'shop',
};

export function departmentGlyph(slug: string | null | undefined): TransitIconName {
  return DEPARTMENT_GLYPHS[slug ?? ''] ?? 'shop';
}

/**
 * The plate box. 16:10 so it matches the `card` aspect token every other
 * marketplace image uses — the tiles have to line up with the product cards
 * further down the page, and a bespoke ratio here would make the grid ragged
 * at the one breakpoint nobody checks.
 */
export const PLATE_W = 400;
export const PLATE_H = 250;

/** Cross-axis centre the stations sit on, and how far the crests swing off it. */
export const PLATE_MID = PLATE_H / 2;
export const PLATE_CREST = 34;

/**
 * ONE line, windowed — not one drawing repeated eleven times.
 *
 * `horizontalLine(n)` puts station `i` at `step * (i + 0.5)` and a crest at
 * every `step * i`, alternating above and below `mid`. So if the whole stop
 * list is built as a single line `count` stations long and tile `i` shows the
 * slice `[i * PLATE_W, (i + 1) * PLATE_W]`, every tile gets exactly one
 * station dead centre, a crest on each edge, and — because the crest side
 * alternates — a path that mirrors its neighbour's. Laid out in a row the
 * tiles read as one continuous route rather than eleven copies of a motif,
 * and the plate you are looking at tells you where on the line you are.
 *
 * The station stays a cubic ENDPOINT (lineGeometry invariant 1), so the disc
 * is parked on the path exactly rather than near it. Nothing here is allowed
 * to hand-author a `d`.
 */
export const plateWindow = (index: number): string => `${index * PLATE_W} 0 ${PLATE_W} ${PLATE_H}`;

/** Where the disc lands inside that window: the station, in window coordinates. */
export const PLATE_STATION_X = PLATE_W / 2;

/** Radius of the paper disc the glyph sits in. */
export const PLATE_DISC_R = 62;

/** Glyph box inside the disc. The mark is drawn on a 100x100 grid. */
export const PLATE_GLYPH_SCALE = 0.74;
