import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface LensProps {
  children: React.ReactNode;
  zoom?: number;
  size?: number;
  className?: string;
}

/**
 * Aceternity-style "Lens" — circular magnifier that follows the cursor and
 * scales the underlying content (typically an image) inside its mask.
 * Falls back to plain children on reduced-motion.
 */
export function Lens({ children, zoom = 1.5, size = 200, className }: LensProps) {
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [active, setActive] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  if (reduced) {
    return <div className={cn('relative overflow-hidden', className)}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onMouseMove={onMove}
      role="presentation"
      className={cn('relative overflow-hidden cursor-zoom-in', className)}
    >
      {children}
      <motion.div
        aria-hidden="true"
        animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.85 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24 }}
        style={{
          width: size,
          height: size,
          left: pos.x - size / 2,
          top: pos.y - size / 2,
          maskImage: `radial-gradient(circle, black ${size / 2 - 1}px, transparent ${size / 2}px)`,
          WebkitMaskImage: `radial-gradient(circle, black ${size / 2 - 1}px, transparent ${size / 2}px)`,
        }}
        className="pointer-events-none absolute z-10 ring-2 ring-foreground/40 rounded-full overflow-hidden"
      >
        <div
          className="absolute"
          style={{
            left: -pos.x * zoom + size / 2,
            top: -pos.y * zoom + size / 2,
            width: `${zoom * 100}%`,
            height: `${zoom * 100}%`,
          }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
