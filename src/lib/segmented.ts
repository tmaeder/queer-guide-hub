import { cn } from '@/lib/utils';

/**
 * A segmented control: one rounded track holding equal-width segments, so a
 * row of choices stays one line on a phone instead of wrapping into chip walls.
 * Shared by the homepage date picker and map layers so the two read alike.
 */
export const SEGMENT_TRACK = 'grid gap-1 rounded-element bg-surface-container p-1';

export const segmentClass = (active: boolean, className?: string) =>
  cn(
    'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-element px-1 text-13 font-bold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-foreground text-background' : 'text-foreground hover:bg-card',
    className,
  );
