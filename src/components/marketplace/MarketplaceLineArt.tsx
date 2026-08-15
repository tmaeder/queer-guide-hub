import { horizontalLine } from '@/components/transit/lineGeometry';
import { cn } from '@/lib/utils';

/**
 * The masthead line device: one accent route, one ghost route behind it, two
 * interchange rings.
 *
 * Transcribed from the design project's shared list/detail masthead (a 420x90
 * box carrying an accent path, an ink path at ~0.16, and two r=8 station
 * circles). Every marketplace masthead — hub, makers directory, maker page —
 * carries the same device so the family reads as one line seen from three
 * places.
 *
 * Geometry comes from `horizontalLine` rather than hand-authored path data.
 * That is not ceremony: hard rule #1 is that an illustrative transit line is
 * never straight, and `lineGeometry` guarantees it structurally — it emits only
 * cubic commands and alternates station/crest so no segment can degenerate. A
 * hand-written `d` can be flattened by a later edit and nothing would catch it.
 *
 * The two routes use DIFFERENT station counts (3 and 2) so their crests land at
 * different x positions and the pair can never run parallel — the same reason
 * `CityNetwork` nudges trunk-sharing lines apart.
 *
 * Proportional scaling on purpose: no `preserveAspectRatio="none"` here, so the
 * stroke stays round and the crest keeps the amplitude it was designed at. The
 * amplitude note in `lineGeometry` only bites when a box is stretched.
 */
export function MarketplaceLineArt({
  className,
  tone = 'paper',
}: {
  className?: string;
  /** `ink` inverts the ghost route and the ring fill for use on `bg-foreground`. */
  tone?: 'paper' | 'ink';
}) {
  const accent = horizontalLine(3, { view: { w: 420, h: 90 }, mid: 34, crest: 12 });
  const ghost = horizontalLine(2, { view: { w: 420, h: 90 }, mid: 64, crest: 10 });
  const onInk = tone === 'ink';

  return (
    <svg
      viewBox="0 0 420 90"
      className={cn('h-auto w-full max-w-[340px] shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth={9} strokeLinecap="round">
        {/* The ghost has to invert or it vanishes: `foreground/15` on an ink
            band is ink on ink. */}
        <path
          d={ghost.segments.join(' ')}
          className={onInk ? 'stroke-background/25' : 'stroke-foreground/15'}
        />
        <path d={accent.segments.join(' ')} className="stroke-track-yellow" />
      </g>
      {/* Rings sit on `accent.stations`, which ARE cubic endpoints — so they
          land on the path exactly rather than near it. */}
      <g
        className={onInk ? 'fill-foreground stroke-background' : 'fill-background stroke-foreground'}
        strokeWidth={4}
      >
        {accent.stations.slice(0, 2).map((s) => (
          <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={8} />
        ))}
      </g>
    </svg>
  );
}
