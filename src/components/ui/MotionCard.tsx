import * as React from 'react';
import { cn } from '@/lib/utils';

interface MotionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

// Hover-tint card. CSS-only: card.tsx re-exports this on every public page,
// so a framer-motion import here would chain ~97 KB onto the entry chunk.
export const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ className, children, hoverable: _hoverable, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Matches card.tsx — plate, no outline.
          'bg-surface-container text-card-foreground rounded-container',
          'transition-colors duration-fast hover:bg-muted/40 motion-reduce:transition-none',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
MotionCard.displayName = 'MotionCard';
