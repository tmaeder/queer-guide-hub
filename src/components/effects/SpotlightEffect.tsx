import { useRef, useState, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface SpotlightEffectProps {
  children: React.ReactNode;
  className?: string;
  size?: number;
  intensity?: number;
}

export function SpotlightEffect({
  children,
  className,
  size = 400,
  intensity = 0.06,
}: SpotlightEffectProps) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || reduced) return;
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [reduced],
  );

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions */
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none z-0"
        animate={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(${size}px circle at ${position.x}px ${position.y}px, hsl(var(--foreground) / ${intensity}), transparent 80%)`,
        }}
        transition={{ opacity: { duration: 0.3 }, background: { duration: 0 } }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
