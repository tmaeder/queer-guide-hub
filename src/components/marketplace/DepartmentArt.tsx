import { horizontalLine } from '@/components/transit/lineGeometry';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { cn } from '@/lib/utils';
import {
  PLATE_CREST,
  PLATE_DISC_R,
  PLATE_GLYPH_SCALE,
  PLATE_H,
  PLATE_MID,
  PLATE_STATION_X,
  PLATE_W,
  departmentGlyph,
  plateWindow,
} from './departmentPlate';

/**
 * Category art for a marketplace department: a stop on the M line.
 *
 * WHY THIS IS DRAWN AND NOT PHOTOGRAPHED. The tiles used to show
 * `useDepartmentCovers()` — the first image of the highest-`boutique_score`
 * SFW listing per department, taken from a global top-60. Two things were
 * wrong with that and only one of them was fixable by picking better photos:
 *
 *  1. The top-60 was global, so jewelry took 38 of the 60 slots and FIVE of
 *     the eleven departments (books_art, intimacy, bdsm_fetish, home,
 *     services) resolved to no cover at all — the grid rendered image tiles
 *     beside bare text tiles of a different height.
 *  2. More fundamentally, a product photograph depicts ONE product. Apparel
 *     resolved to a sport sock and Hygiene & Care to a pair of PRIDE socks.
 *     Even with a perfect picker, "the single best-scoring item" is the wrong
 *     kind of image for a slot that has to stand for 18,602 of them, and the
 *     merchant CDN assets behind it are frequently 300x300 thumbnails being
 *     stretched into a 16:10 plate.
 *
 * So departments get drawn art and products keep photography — which is also
 * what Brand Guidelines §08 wants, since it forbids treatments on photos but
 * says nothing against illustration that never pretends to be one.
 *
 * THE LINE IS YELLOW; THE MARKS ARE NOT. This paragraph used to read "ONE HUE,
 * NOT FOUR" and argued that painting eleven stops in four colours would assert
 * four routes that do not exist. That rule was reversed deliberately when Icon
 * System v2 landed (2026-10-17): under v2 a track colour belongs to the ICON,
 * chosen by what the icon means, and an icon that drops its colour on one
 * surface is a different icon there. So the department MARK now renders in its
 * own hue, exactly as the same glyph does in the glossary, the nav and search.
 *
 * What did NOT change is the LINE: `--track-yellow` still carries the route
 * through every plate, and the route is what says "one line, eleven stops".
 * The hue of a station's mark was never what asserted a route — the stroke
 * running between the stations is. 1.4.11 is unaffected: every mark is still
 * fill-with-an-ink-outline, and it meets the disc at that outline.
 *
 * The ACTIVE tile is the exception and it is arithmetic, not taste. Its disc
 * inverts to `fill-foreground`, and a mark whose outline is ink is invisible on
 * an ink disc — the `bg-foreground` trap, where the class names still read
 * correctly and the glyph disappears. The active tile therefore draws the
 * monochrome rendition in `currentColor` against `text-background`, which is
 * theme-aware where a literal would not be.
 *
 * The `index` / `count` pair is load-bearing, not decoration — see
 * `plateWindow`. Pass the position in the RENDERED tile list, not in
 * `DEPARTMENT_ORDER`: the hub drops `other` and hides the adult departments
 * until the 18+ opt-in, and feeding it a canonical index would leave gaps in
 * a line whose whole job is to be continuous.
 */
export function DepartmentArt({
  slug,
  index,
  count,
  glyph,
  active = false,
  className,
}: {
  slug: string;
  /** Mark for the disc. Defaults to the department's own; the category index
   *  passes a group's mark so the same plate can stand for a group tile. */
  glyph?: TransitIconName;
  /** Position in the rendered list — this plate's window onto the shared line. */
  index: number;
  /** How many plates are on the line, i.e. how long the line is. */
  count: number;
  /** Inverts to the ink treatment for the tile you are standing at. */
  active?: boolean;
  className?: string;
}) {
  // The whole stop list as one line, then sliced. `count` is clamped because a
  // zero-station line divides by zero, and a single-tile line still needs a
  // crest on each edge to bend at all.
  const line = horizontalLine(Math.max(1, count), {
    view: { w: PLATE_W * Math.max(1, count), h: PLATE_H },
    mid: PLATE_MID,
    crest: PLATE_CREST,
  });

  const cx = index * PLATE_W + PLATE_STATION_X;
  const g = PLATE_GLYPH_SCALE;

  return (
    <svg
      viewBox={plateWindow(index)}
      className={cn('block h-auto w-full', className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* Field. Recessed one rung against the card so the plate reads as a
          window rather than as more card. Both rungs invert with the theme. */}
      <rect
        x={index * PLATE_W}
        y={0}
        width={PLATE_W}
        height={PLATE_H}
        className={active ? 'fill-foreground' : 'fill-surface-container-low'}
      />

      {/* This tile's slice of the route, and ONLY it. `segments[i]` is
          `crest[i] → station[i] → crest[i + 1]` by construction, and crests sit
          at `step * i` — so segment `i` spans exactly the window, no clipping
          arithmetic required. Consecutive segments share their crest
          coordinates EXACTLY (lineGeometry invariant 3), which is what makes
          the line leave one tile at the height it enters the next instead of
          at a seam. Round caps overhang the crest by half a stroke and get
          clipped by the viewBox, so the line touches both edges cleanly.

          Yellow in BOTH treatments: a track colour is identity and never
          inverts with the surface. */}
      <path
        d={line.segments[index] ?? line.segments[0]}
        fill="none"
        strokeWidth={12}
        strokeLinecap="round"
        className="stroke-track-yellow"
      />

      {/* The station, drawn as an interchange disc with the department's mark
          inside it. The line passes BEHIND, which is what ties the mark to the
          route instead of leaving it floating on a coloured field.

          THE DISC PAIR IS MEASURED, NOT REASONED. The first version used
          `fill-card stroke-track-ring`, which is the pairing every other plate
          in the product uses and which reads correctly — paper disc, ink ring.
          In dark mode it renders NOTHING: `--card` and `--surface-container-low`
          both resolve to rgb(35,35,31), so the disc fill equalled its own
          field, and `--track-ring` is ink in BOTH modes by design (that is the
          point of it) which put a rgb(17,17,17) ring on a rgb(35,35,31) field.
          The glyph floated with no plate under it. Same family as the
          `bg-foreground` trap: the class names say "paper disc, ink ring" in
          both modes and a class-name assertion stays green.
          `--background` / `--foreground` are the only pair guaranteed to
          separate from the field in both modes, so the disc uses those. */}
      <circle
        cx={cx}
        cy={PLATE_MID}
        r={PLATE_DISC_R}
        strokeWidth={5}
        className={
          active ? 'fill-foreground stroke-background' : 'fill-background stroke-foreground'
        }
      />
      <g
        transform={`translate(${cx - 50 * g} ${PLATE_MID - 50 * g}) scale(${g})`}
        className={active ? 'text-background' : undefined}
      >
        {/* `ticks={false}`: the disc is this glyph's boundary, so its tick
            margin is interior — ticks here read as marks ON the disc, not as
            motion around the icon. */}
        <TransitIcon
          name={glyph ?? departmentGlyph(slug)}
          size={100}
          ticks={false}
          {...(active ? { color: 'currentColor' } : {})}
        />
      </g>
    </svg>
  );
}
