import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface WobbleCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  containerClassName?: string;
}

/**
 * Aceternity-style WobbleCard — soft tilt + child counter-translate creating
 * a parallax wobble effect on hover. Monochrome.
 */
export function WobbleCard({ children, className, containerClassName, ...rest }: WobbleCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [hovered, setHovered] = React.useState(false);
  const reduced = useReducedMotion();

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 30,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 30,
    });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPos({ x: 0, y: 0 });
      }}
      style={{
        transform: hovered && !reduced ? `translate3d(${pos.x}px, ${pos.y}px, 0) scale(1.02)` : 'translate3d(0,0,0) scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className={cn(
        'group relative rounded-2xl overflow-hidden bg-card border border-border/60 shadow-[var(--shadow-aceternity-sm)] hover:shadow-[var(--shadow-aceternity)]',
        containerClassName,
      )}
      {...(rest as Record<string, unknown>)}
    >
      <motion.div
        style={{
          transform: hovered && !reduced ? `translate3d(${-pos.x}px, ${-pos.y}px, 0)` : 'translate3d(0,0,0)',
          transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={cn('h-full p-6', className)}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
