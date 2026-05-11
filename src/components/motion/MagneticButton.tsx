import React from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import { springs } from '@/lib/motion';

interface MagneticButtonProps {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}

/**
 * Cursor-following hover wrapper. Drops in around hero CTAs.
 * Disabled under reduced motion.
 */
export const MagneticButton = ({
  children,
  strength = 0.25,
  className,
}) => {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, springs.soft);
  const sy = useSpring(y, springs.soft);
  const ref = React.useRef<HTMLDivElement>(null);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * strength);
    y.set((e.clientY - cy) * strength);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, display: 'inline-block' }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {children}
    </motion.div>
  );
};

export default MagneticButton;
