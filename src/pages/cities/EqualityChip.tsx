import { cn } from '@/lib/utils';
import { tierFor, type EqualityTier } from '@/utils/citiesFilter';
import { getScoreRingColor } from '@/utils/equalityScore';

interface EqualityChipProps {
  score: number | null | undefined;
  className?: string;
  /** Show the human label (Very High, High, …) instead of the numeric score. */
  showLabel?: boolean;
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
 * Compact equality chip for list rows. Monochrome text + border; the only
 * chromatic element is a 6px tier dot using the allowlisted equality-scores
 * functional scale (see eslint.config.js — file is on the per-file ignore
 * list for the color-literal rule).
 */
export function EqualityChip({ score, className, showLabel = false }: EqualityChipProps) {
  const tier = tierFor(score);
  const label = showLabel || score == null ? TIER_LABEL[tier] : `${Math.round(score)}`;
  const dotColor = getScoreRingColor(score);
  const ariaLabel =
    score == null
      ? `Equality score unknown`
      : `Equality score ${Math.round(score)}, ${TIER_LABEL[tier]}`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-badge border border-foreground/15 bg-background px-2 py-0.5 text-13 font-medium text-foreground',
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
