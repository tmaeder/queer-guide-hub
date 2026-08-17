import { cn } from '@/lib/utils';
import type { MilestoneImpact } from '@/types/milestone';

/**
 * Timeline node glyph encoding milestone impact WITHOUT hue: filled ink disc =
 * positive, open ink ring = neutral, destructive ✕ = negative. Read along the
 * /history spine that is "it happened" / "a marker on the line" / "the line was
 * cut here" — shape-encoded, so it survives greyscale and protanopia.
 *
 * Deliberately NOT merged into `src/components/transit/StationRing.tsx`, whose
 * API is `state` + `track`. Impact is a STATE, and the design system's rule is
 * that track colours are wayfinding and may never encode one; a component
 * carrying both props next to each other is an open invitation to
 * `track={impact === 'negative' ? … }`. Instead the two are kept
 * geometrically interchangeable — at `size="station"` this renders the exact
 * box model StationRing does (16px, 3px ink ring), asserted in the unit test —
 * so both can mark the same track without either learning the other's job.
 *
 * `negative` keeps the reserved `--destructive` token: the same
 * functional-severity exception the jurisdiction status glyphs use.
 */
export function MilestoneImpactMarker({
  impact,
  size = 'inline',
  className,
}: {
  impact: MilestoneImpact;
  /** `station` matches StationRing's box model for use on the /history spine. */
  size?: 'inline' | 'station';
  className?: string;
}) {
  const station = size === 'station';
  const box = station ? 'h-4 w-4' : 'h-3 w-3';

  if (impact === 'negative') {
    return (
      <span
        aria-hidden
        // The paper disc punches the track out behind the glyph so a cut reads
        // as a break IN the line rather than a mark laid on top of it.
        className={cn(
          'grid place-items-center rounded-full bg-background text-destructive',
          box,
          className,
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-full w-full"
          fill="none"
          stroke="currentColor"
          strokeWidth={station ? 2.6 : 2.2}
          strokeLinecap="round"
        >
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'rounded-full',
        box,
        // A MARK, not a container, so it keeps its ring through the de-caging.
        // Its geometry matches StationRing (pinned by milestoneRow.test.tsx),
        // but the colour token deliberately does NOT: `--foreground`, never
        // `--track-ring`.
        //
        // `--track-ring` exists to gate a TRACK-COLOURED fill, and this marker
        // may never carry one — impact is a state. Using it here also put a
        // `border-track-*` class on a component whose negative branch returns a
        // different glyph entirely, so the track-class set started varying with
        // impact and MilestoneDetail.parts.test.tsx caught it. Both tokens are
        // the same ink; only the namespace differs, and the namespace is the
        // part that carries the rule.
        station ? 'border-[3px] border-foreground' : 'border-2 border-foreground',
        impact === 'positive' ? 'bg-foreground' : 'bg-background',
        className,
      )}
    />
  );
}
