import { cn } from '@/lib/utils';
import { tierFor, type EqualityTier } from '@/utils/citiesFilter';
import { getScoreRingColor } from '@/utils/equalityScore';

interface EqualityChipProps {
  score: number | null | undefined;
  className?: string;
  /** Show the human label (Very High, High, …) instead of the numeric score. */
  showLabel?: boolean;
  /**
   * `plate` (default) is the original tinted chip with the coloured tier dot.
   *
   * `ink` drops the dot and the plate entirely and inherits its colour from the
   * parent. It exists for the /cities card, which sits directly under a city's
   * transit diagram — and the two colour systems collide there, measurably:
   * `--track-green` (#2BE05A, hue 136) is 6.5° from the very-high tier's #22c55e
   * (hue 142), and `--track-yellow` (#FFD500, hue 50) is 4.7° from moderate's
   * #eab308. Twenty pixels apart, one of those marks means "the third-longest
   * metro line" and the other means "this country is safe for you". The design
   * system's rule is explicit — track colours never reach the equality scale —
   * and nothing in CI can catch this particular breach, because an SVG stroke has
   * no background-color for the sanctioned-ink sweep to read.
   *
   * Inheriting rather than setting a colour is what lets the same chip stay
   * legible on a card that fills ink when selected.
   */
  variant?: 'plate' | 'ink';
}

const TIER_LABEL: Record<EqualityTier, string> = {
  'very-high': 'Very High',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  'very-low': 'Very Low',
  unknown: 'No data',
};

/**
 * Compact equality chip for list rows. Monochrome plate; the only chromatic
 * element is a 6px tier dot using the allowlisted equality-scores functional
 * scale (see eslint.config.js — file is on the per-file ignore list for the
 * color-literal rule).
 *
 * The chip is a PLATE, not an outline. It used to be `bg-background` (the page
 * colour) with a `border-foreground/15` hairline, which made the border the
 * only thing separating it from the page — so the fill has to carry the edge
 * once the hairline goes, hence `bg-surface-container` rather than a bare
 * border deletion. This one component rendered 1,218 of the site's borders,
 * because it repeats per row on every city list (/cities, /africa, /europe).
 */
export function EqualityChip({
  score,
  className,
  showLabel = false,
  variant = 'plate',
}: EqualityChipProps) {
  const tier = tierFor(score);
  const label = showLabel || score == null ? TIER_LABEL[tier] : `${Math.round(score)}`;
  const dotColor = getScoreRingColor(score);
  const ariaLabel =
    score == null
      ? `Equality score unknown`
      : `Equality score ${Math.round(score)}, ${TIER_LABEL[tier]}`;

  if (variant === 'ink') {
    return (
      <span
        className={cn('inline-flex items-baseline gap-1.5', className)}
        aria-label={ariaLabel}
        data-tier={tier}
      >
        <span className="text-13 font-bold tabular-nums">{label}</span>
        {/* The tier word carries the meaning a bare number does not — but only
            when the label IS a number. With `showLabel` the label already is the
            tier, and rendering both printed "Very High Very High". `opacity`
            rather than a muted token, so it survives the inverted (ink-filled)
            card without needing a second colour rule. */}
        {score != null && !showLabel && (
          <span aria-hidden className="text-2xs uppercase tracking-label opacity-70">
            {TIER_LABEL[tier]}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-badge bg-surface-container px-2 py-0.5 text-13 font-medium text-foreground',
        className,
      )}
      aria-label={ariaLabel}
      data-tier={tier}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {label}
    </span>
  );
}

export { TIER_LABEL };
