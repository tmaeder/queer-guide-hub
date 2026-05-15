import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface AnimatedBeamProps {
  containerRef: React.RefObject<HTMLElement | null>;
  fromRef: React.RefObject<HTMLElement | null>;
  toRef: React.RefObject<HTMLElement | null>;
  duration?: number;
  delay?: number;
  curvature?: number;
  reverse?: boolean;
  className?: string;
  pathOpacity?: number;
}

/**
 * Aceternity-style AnimatedBeam — draws an SVG path between two refs with a
 * traveling gradient along it. Pairs nicely with refs on logos / nodes in a
 * "data flow" diagram. Monochrome.
 */
export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  duration = 5,
  delay = 0,
  curvature = -40,
  reverse = false,
  className,
  pathOpacity = 0.18,
}: AnimatedBeamProps) {
  const id = React.useId().replace(/:/g, '');
  const [path, setPath] = React.useState({ d: '', w: 0, h: 0 });
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const update = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current) return;
      const c = containerRef.current.getBoundingClientRect();
      const a = fromRef.current.getBoundingClientRect();
      const b = toRef.current.getBoundingClientRect();
      const sx = a.left - c.left + a.width / 2;
      const sy = a.top - c.top + a.height / 2;
      const ex = b.left - c.left + b.width / 2;
      const ey = b.top - c.top + b.height / 2;
      const cx = (sx + ex) / 2;
      const cy = (sy + ey) / 2 + curvature;
      setPath({
        d: `M ${sx},${sy} Q ${cx},${cy} ${ex},${ey}`,
        w: c.width,
        h: c.height,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [containerRef, fromRef, toRef, curvature]);

  return (
    <svg
      className={cn('pointer-events-none absolute inset-0 z-0', className)}
      width={path.w}
      height={path.h}
      aria-hidden="true"
    >
      <path d={path.d} stroke="hsl(var(--foreground))" strokeOpacity={pathOpacity} strokeWidth="2" fill="none" />
      {!reduced && (
        <motion.path
          d={path.d}
          strokeWidth="2"
          stroke={`url(#beam-${id})`}
          strokeOpacity="1"
          strokeLinecap="round"
          fill="none"
        />
      )}
      <defs>
        <motion.linearGradient
          id={`beam-${id}`}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: '0%', x2: '0%', y1: '0%', y2: '0%' }}
          animate={
            reduced
              ? {}
              : {
                  x1: reverse ? ['90%', '-10%'] : ['-10%', '110%'],
                  x2: reverse ? ['100%', '0%'] : ['0%', '120%'],
                  y1: ['0%', '0%'],
                  y2: ['0%', '0%'],
                }
          }
          transition={{ delay, duration, repeat: Infinity, ease: 'linear', repeatDelay: 0 }}
        >
          <stop stopColor="hsl(var(--foreground))" stopOpacity="0" />
          <stop offset="0.325" stopColor="hsl(var(--foreground))" />
          <stop offset="1" stopColor="hsl(var(--foreground))" stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  );
}
