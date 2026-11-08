import * as React from 'react';
import { cn } from '@/lib/utils';

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number | null }
>(({ className, value, ...props }, ref) => {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : pct}
      aria-valuetext={value == null ? undefined : `${Math.round(pct)}%`}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className="h-full w-full origin-left bg-primary transition-transform"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
});
Progress.displayName = 'Progress';

export { Progress };
