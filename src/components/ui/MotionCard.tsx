import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface MotionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

// Hover-lift card. Lives in its own file so consumers importing the plain
// Card don't pull framer-motion into their bundle.
export const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ className, children, ...props }, ref) => {
    const reduced = useReducedMotion();
    const hover = reduced
      ? {}
      : {
          whileHover: { y: -3 },
          transition: springs.snappy,
        };
    return (
      <motion.div
        ref={ref}
        className={cn(
          'bg-card text-card-foreground rounded-container border border-border/60 transition-shadow hover:shadow-[var(--shadow-aceternity)]',
          className,
        )}
        {...hover}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </motion.div>
    );
  },
);
MotionCard.displayName = 'MotionCard';
