import * as React from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface DraggableCardBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface DraggableCardContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Aceternity-style draggable card — physics-style drag with rotation and
 * elastic return. Wrap multiple in DraggableCardContainer for a "stack".
 */
export function DraggableCardBody({ children, className }: DraggableCardBodyProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduced = useReducedMotion();
  const rotateX = useSpring(useTransform(y, [-150, 150], [12, -12]), { stiffness: 200, damping: 22 });
  const rotateY = useSpring(useTransform(x, [-150, 150], [-12, 12]), { stiffness: 200, damping: 22 });

  return (
    <motion.div
      drag={!reduced}
      dragElastic={0.2}
      dragMomentum
      dragConstraints={{ top: -80, left: -80, right: 80, bottom: 80 }}
      style={reduced ? undefined : { x, y, rotateX, rotateY, transformStyle: 'preserve-3d' }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative cursor-grab active:cursor-grabbing rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-aceternity)] select-none',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function DraggableCardContainer({ children, className }: DraggableCardContainerProps) {
  return <div className={cn('relative', className)}>{children}</div>;
}
