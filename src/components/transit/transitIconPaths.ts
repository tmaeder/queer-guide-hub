/** Shared outline paths for inline icons, map markers, and the favicon. */
import { ICON_DEFS, inkPathOf } from './iconDefs';
import { SITE_ICON_ARTWORK } from './siteIconArtwork';

export type TransitIconName = keyof typeof ICON_DEFS;

export const TRANSIT_ICON_PATHS = Object.fromEntries(
  Object.entries(ICON_DEFS).map(([name, def]) => [
    name,
    SITE_ICON_ARTWORK[name as TransitIconName] ?? inkPathOf(def),
  ]),
) as Record<TransitIconName, string>;

export const TRANSIT_ICON_NAMES = Object.keys(ICON_DEFS) as TransitIconName[];

export const FILLABLE_ICONS: ReadonlySet<TransitIconName> = new Set([
  'saved',
  'star',
  'bookmark',
  'thumbs-up',
  'thumbs-down',
]);
