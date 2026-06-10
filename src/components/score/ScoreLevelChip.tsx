import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ScoreLevelChipProps {
  level: number;
  tier: string;
  totalPoints?: number;
  progress?: number; // 0..1
  /** Compact: tier label + level only. Default: includes progress bar. */
  compact?: boolean;
  className?: string;
}

/**
 * Pure presentational chip — shows Community Score level and tier.
 * Monochrome, follows project design tokens (rounded-element, 8pt grid).
 */
export function ScoreLevelChip({
  level,
  tier,
  totalPoints,
  progress,
  compact = false,
  className,
}: ScoreLevelChipProps) {
  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-badge border border-border px-2 py-0.5 text-13 text-foreground',
          className,
        )}
        title={
          totalPoints !== undefined ? `${totalPoints} points · ${tier} · Level ${level}` : undefined
        }
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        <span>{tier}</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums">L{level}</span>
      </span>
    );
  }

  const pct = Math.max(0, Math.min(1, progress ?? 0));

  return (
    <div
      className={cn(
        'inline-flex flex-col gap-1.5 rounded-element border border-border px-4 py-2',
        className,
      )}
    >
      <div className="flex items-baseline gap-2">
        <Sparkles className="h-4 w-4 self-center text-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">{tier}</span>
        <span className="text-13 text-muted-foreground">Level</span>
        <span className="text-sm font-medium tabular-nums text-foreground">{level}</span>
        {totalPoints !== undefined && (
          <span className="ml-auto text-13 tabular-nums text-muted-foreground">
            {totalPoints} pts
          </span>
        )}
      </div>
      {progress !== undefined && (
        <div
          className="h-1 w-full overflow-hidden rounded-badge bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(pct * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress to level ${level + 1}`}
        >
          <div
            className="h-full bg-foreground transition-[width] duration-500"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
