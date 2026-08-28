import { horizontalLine } from '@/components/transit/lineGeometry';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';
import { cn } from '@/lib/utils';
import { DEFAULT_CATEGORY_ICON, type CategoryLine } from '@/lib/tags/categoryIdentity';

/**
 * Illustration for a glossary term: a stop on its taxonomy line.
 *
 * WHY THIS IS DRAWN AND NOT PHOTOGRAPHED. The glossary carried 1,590 stock
 * photos, sourced by taking the FIRST Pexels/Unsplash hit for a keyword-mapped
 * tag name — no scoring, no content check, no attribution written (1,262 of
 * them had no recoverable license at all). A stock photo for an abstract term
 * is arbitrary at best, and the photo-densest categories were the kink
 * vocabularies, where an arbitrary photograph is not a neutral mistake. The
 * 2026-08-28 decision retired photography from the glossary entirely — the
 * same conclusion `DepartmentArt` reached for marketplace departments, for the
 * same reason: a slot that stands for a CONCEPT wants drawn art, not the
 * single image that happened to rank first.
 *
 * The drawing is `DepartmentArt`'s grammar at the glossary's 4:3 aspect: one
 * continuous line windowed per tile, a station disc parked on a cubic
 * endpoint, and the term's taxonomy-line icon inside the disc.
 *
 * O(1) PER TILE, NOT O(count). DepartmentArt builds the whole 11-station line
 * and windows it; a glossary result set is 2,875 tiles, and building a
 * 2,875-segment path per card is quadratic across the grid. But
 * `horizontalLine`'s step is `w / n` = TAG_PLATE_W here, so segment `i`
 * depends only on the PARITY of `i` (crests alternate sides at fixed x
 * spacing): every even window shows one shape, every odd window its mirror,
 * exactly as in the full construction. So the module builds ONE two-station
 * line and odd tiles translate the second segment into the window — the
 * rendered route is byte-identical to the windowed full line, including the
 * shared crest at every tile boundary (lineGeometry invariant 3).
 *
 * PINK, NOT A PER-CATEGORY HUE. `categoryIdentity.ts` already rules this:
 * every tag chip on the site renders `ROUTE_BULLET_MAP.tag`'s pink `#`, so
 * pink is the tag system's one accent and a parent line is identified by its
 * ICON plus an ink ring, never by colour. The track is fill-only and meets the
 * disc at an ink ring (1.4.11 fill-vs-ring, as everywhere else).
 *
 * The disc pair is `background`/`foreground`, copied from DepartmentArt's
 * measured dark-mode fix — `fill-card stroke-track-ring` reads identically in
 * class names and renders an invisible disc on a dark field.
 */

export const TAG_PLATE_W = 400;
export const TAG_PLATE_H = 300; // 4:3 — the aspect the glossary card well already used.
const PLATE_MID = TAG_PLATE_H / 2;
const PLATE_CREST = 42;
const PLATE_DISC_R = 62;
const PLATE_GLYPH_SCALE = 0.74;
const PLATE_STATION_X = TAG_PLATE_W / 2;

/** Two windows of the infinite line: `segments[0]` for even tiles, `segments[1]`
 *  (translated one window left) for odd. */
const TRACK = horizontalLine(2, {
  view: { w: TAG_PLATE_W * 2, h: TAG_PLATE_H },
  mid: PLATE_MID,
  crest: PLATE_CREST,
});

export function TagPlate({
  line,
  index = 0,
  className,
}: {
  /** The term's parent taxonomy line; falls back to the library glyph. */
  line?: CategoryLine;
  /** Position in the rendered tile list — decides which window of the shared
   *  line this plate shows, so neighbouring tiles mirror each other. */
  index?: number;
  className?: string;
}) {
  const odd = Math.abs(index) % 2 === 1;
  const glyph = TRANSIT_ICON_PATHS[line?.icon ?? DEFAULT_CATEGORY_ICON];
  const g = PLATE_GLYPH_SCALE;

  return (
    <svg
      viewBox={`0 0 ${TAG_PLATE_W} ${TAG_PLATE_H}`}
      className={cn('block h-auto w-full', className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* Field: recessed one rung against the card, like DepartmentArt. */}
      <rect
        x={0}
        y={0}
        width={TAG_PLATE_W}
        height={TAG_PLATE_H}
        className="fill-surface-container-low"
      />

      {/* This tile's slice of the route. Round caps overhang the crest by half
          a stroke and are clipped by the viewBox, so the line touches both
          edges cleanly. */}
      <path
        d={TRACK.segments[odd ? 1 : 0]}
        transform={odd ? `translate(-${TAG_PLATE_W} 0)` : undefined}
        fill="none"
        strokeWidth={12}
        strokeLinecap="round"
        className="stroke-track-pink"
      />

      <circle
        cx={PLATE_STATION_X}
        cy={PLATE_MID}
        r={PLATE_DISC_R}
        strokeWidth={5}
        className="fill-background stroke-foreground"
      />
      <g
        transform={`translate(${PLATE_STATION_X - 50 * g} ${PLATE_MID - 50 * g}) scale(${g})`}
        className="stroke-foreground"
      >
        <path d={glyph} fill="none" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
