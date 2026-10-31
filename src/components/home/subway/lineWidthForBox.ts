/**
 * Line weight for `thumb` and `backdrop`, in SCREEN pixels (both use
 * `vector-effect: non-scaling-stroke`, because each crops to its own city's
 * bounding box and the same user-unit width would render at a different
 * thickness per city).
 *
 * The weight follows the diagram's rendered size, because the same component
 * draws everything from a 48px search thumbnail to a ~300px city-card header
 * to a full masthead backdrop. A single fixed width was always wrong
 * somewhere: 2.5px read as a hairline on the city cards, and any weight that
 * read well there would clog a 48px thumb. It is the shorter side of the
 * rendered box times LINE_PX_PER_BOX_PX (0.04: the homepage city card, 153px
 * tall at a 1440px viewport, lands on the 6px it shipped with), clamped to [MIN, MAX]. The 4.5px floor was chosen by eye against the 96px-tall
 * /going-out tiles, where 3.5px read as a hairline, and still holds in 48px thumbs.
 */
export const LINE_PX_PER_BOX_PX = 0.04;
export const MIN_LINE_PX = 4.5;
export const MAX_LINE_PX = 7;
/** Used until the first measurement lands, and where ResizeObserver is absent. */
export const FALLBACK_LINE_PX = 4.5;

export function lineWidthForBox(width: number, height: number): number {
  const side = Math.min(width, height);
  if (!(side > 0)) return FALLBACK_LINE_PX;
  const px = side * LINE_PX_PER_BOX_PX;
  return Math.round(Math.min(MAX_LINE_PX, Math.max(MIN_LINE_PX, px)) * 2) / 2;
}
