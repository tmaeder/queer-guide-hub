import { cn } from '@/lib/utils';
import type { MilestoneImpact } from '@/types/milestone';

/**
 * Timeline node glyph encoding milestone impact without hue (monochrome
 * system): filled circle = positive, outline circle = neutral. Negative
 * (criminalization / persecution) uses the reserved `destructive` token — the
 * same functional-severity exception the jurisdiction status glyphs use.
 */
export function MilestoneImpactMarker({
  impact,
  className,
}: {
  impact: MilestoneImpact;
  className?: string;
}) {
  if (impact === 'negative') {
    return (
      <span
        aria-hidden
        className={cn(
          'flex h-3 w-3 items-center justify-center text-destructive',
          className,
        )}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'h-3 w-3 rounded-full',
        impact === 'positive' ? 'bg-foreground' : 'border-2 border-muted-foreground bg-background',
        className,
      )}
    />
  );
}
