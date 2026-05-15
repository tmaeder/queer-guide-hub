import * as React from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface CometCardProps {
  children: React.ReactNode;
  className?: string;
  /** Card aspect ratio: 'video' = 16/9, 'square' = 1, 'auto' = no constraint. */
  aspect?: 'video' | 'square' | 'auto';
}

/**
 * Aceternity-style CometCard — 3D-tilting card with a comet trail (a
 * radial highlight that follows the cursor) traveling across its surface.
 * Strictly monochrome.
 */
export function CometCard({ children, className, aspect = 'auto' }: CometCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduced = useReducedMotion();

  const springX = useSpring(x, { stiffness: 200, damping: 22 });
  const springY = useSpring(y, { stiffness: 200, damping: 22 });
  const rotateX = useTransform(springY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-10, 10]);
  const cometX = useTransform(springX, [-0.5, 0.5], ['0%', '100%']);
  const cometY = useTransform(springY, [-0.5, 0.5], ['0%', '100%']);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const aspectClass = aspect === 'video' ? 'aspect-video' : aspect === 'square' ? 'aspect-square' : '';

  return (
    <div className="flex items-center justify-center" style={{ perspective: '1000px' }}>
      <motion.div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={() => {
          x.set(0);
          y.set(0);
        }}
        style={reduced ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className={cn(
          'relative rounded-container overflow-hidden bg-card border border-border/60 shadow-[var(--shadow-aceternity-sm)] hover:shadow-[var(--shadow-aceternity)] transition-shadow',
          aspectClass,
          className,
        )}
      >
        {!reduced && (
          <motion.div
            aria-hidden="true"
            style={{
              left: cometX,
              top: cometY,
              translateX: '-50%',
              translateY: '-50%',
            }}
            className="pointer-events-none absolute h-32 w-32 rounded-full bg-foreground/15 blur-2xl"
          />
        )}
        <div className="relative z-10 h-full">{children}</div>
      </motion.div>
    </div>
  );
}
