import { horizontalLine } from '@/components/transit/lineGeometry';
import { cn } from '@/lib/utils';

const VIEW_W = 640;
const VIEW_H = 400;

/**
 * Cover art for a curated SET of picks — a marketplace collection, or a guide.
 * Drawn as a short run of the M line with one station per pick.
 *
 * THE FALLBACK IT REPLACES WAS A LIE ABOUT ITS OWN CONTENT.
 * `MarketplaceHeroCover` did `hero.cover_image_url ?? listings[0]?.images?.[0]`,
 * and no collection in the table has ever had a `cover_image_url` — so every
 * hero the page has shown has been the first product's own photograph,
 * promoted to stand for the whole collection. On prod that made a Mister B
 * leather vest the face of "Pride essentials". A cover has to describe a SET;
 * the first member's product shot describes one member and, worse, reads as
 * an editorial claim that this item is the point.
 *
 * `GuideCard` had the same hole with a different floor: no hero image meant a
 * grey box with the word "Editorial" in it, which is what 10 of the 12
 * published guides render — including every marketplace guide but one.
 *
 * So both are drawn instead, and the plate says the one true thing a cover can
 * say with no editor in the loop: how many stops are on this line. It cannot
 * go stale against its own content the way a pinned photo of a since-removed
 * product would.
 *
 * `cover_image_url` / `hero_image_path` still win when set — this is the
 * floor, not a ceiling, and it exists because the floor used to be "grab a
 * product photo and hope".
 */
export function PicksPlate({
  stops,
  tone = 'ink',
  className,
}: {
  /** Picks in the set. Clamped — see below. */
  stops: number;
  /**
   * `ink` for the page's one editorial moment (the hub hero). `paper` for
   * anything that appears more than once on a screen: three ink plates in a
   * guide rail read as three holes punched in the page.
   */
  tone?: 'ink' | 'paper';
  className?: string;
}) {
  // Clamped to 3..7. Below 3 the line has too few crests to read as a route;
  // above 7 the rings crowd at this width and the plate turns into a dotted
  // rule. A set of 40 is still drawn as 7 — the plate is a diagram of the
  // line, not a count, and the real figure is stated in the card beside it
  // where it can be read as a number.
  const n = Math.min(7, Math.max(3, stops || 3));
  const onInk = tone === 'ink';

  const line = horizontalLine(n, {
    view: { w: VIEW_W, h: VIEW_H },
    mid: VIEW_H / 2,
    crest: 58,
  });

  // A ghost route behind the live one, at a DIFFERENT station count so the two
  // can never run parallel — the `MarketplaceLineArt` rule, for the same
  // reason: two lines at the same n would trace each other exactly.
  const ghost = horizontalLine(Math.max(2, n - 1), {
    view: { w: VIEW_W, h: VIEW_H },
    mid: VIEW_H / 2 + 62,
    crest: 34,
  });

  return (
    <svg
      viewBox={line.viewBox}
      className={cn('block h-auto w-full', className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x={0}
        y={0}
        width={VIEW_W}
        height={VIEW_H}
        className={onInk ? 'fill-foreground' : 'fill-surface-container-low'}
      />

      <path
        d={ghost.segments.join(' ')}
        fill="none"
        strokeWidth={14}
        strokeLinecap="round"
        // The ghost has to invert or it vanishes: `foreground/15` on an ink
        // band is ink on ink.
        className={onInk ? 'stroke-background/20' : 'stroke-foreground/15'}
      />

      {/* Yellow in BOTH tones: a track colour is identity and never inverts
          with the surface it sits on. */}
      <path
        d={line.segments.join(' ')}
        fill="none"
        strokeWidth={18}
        strokeLinecap="round"
        className="stroke-track-yellow"
      />

      {/* Interchange rings, parked on `line.stations` — which ARE cubic
          endpoints, so they land on the path exactly rather than near it.

          `fill-background stroke-foreground` on the paper tone, NOT the
          `fill-card stroke-track-ring` this started as — in dark mode `--card`
          and `--surface-container-low` are the same rgb(35,35,31), so that
          pairing filled the ring with its own field and ringed it in ink that
          was darker than the field. See the longer note in `DepartmentArt`. */}
      <g
        className={
          onInk ? 'fill-foreground stroke-background' : 'fill-background stroke-foreground'
        }
        strokeWidth={7}
      >
        {line.stations.map((s) => (
          <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={17} />
        ))}
      </g>
    </svg>
  );
}
