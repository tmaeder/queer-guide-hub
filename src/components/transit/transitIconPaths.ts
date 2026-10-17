/** The flattened, ink-only rendition of the icon set — DERIVED, never authored.
 *
 *  This module used to BE the icon set: one ink path per name, hand-written.
 *  Icon System v2 moved the drawings into `iconDefs.ts`, where an icon is
 *  filled shapes plus strokes plus a track colour plus metadata, and this file
 *  became the projection of that back down to "one ink path", which is the
 *  shape two callers still need:
 *
 *    - `public/favicon.svg`, which is one file serving a 16px browser tab and a
 *      512px app icon and carries `TRANSIT_ICON_PATHS.rainbow` verbatim
 *      (`brandAssetSync.test.ts` pins the two together);
 *    - the map's pin rasteriser, which draws an INK glyph inside a pin that is
 *      already the layer's track colour — ink-on-track is a measured contrast
 *      fix, so a track-coloured glyph there would be both invisible and wrong.
 *
 *  Keeping it derived rather than keeping the old literals is the whole point:
 *  a second hand-maintained copy of 59 paths is a copy that drifts, and the
 *  favicon drifting from the icon set is exactly the failure the brand-asset
 *  test was written to catch.
 */
import { ICON_DEFS, inkPathOf } from './iconDefs';

export type TransitIconName = keyof typeof ICON_DEFS;

export const TRANSIT_ICON_PATHS = Object.fromEntries(
  Object.entries(ICON_DEFS).map(([name, def]) => [name, inkPathOf(def)]),
) as Record<TransitIconName, string>;

export const TRANSIT_ICON_NAMES = Object.keys(ICON_DEFS) as TransitIconName[];
