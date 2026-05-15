import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface MeteorsProps {
  number?: number;
  className?: string;
}

/**
 * Aceternity-style meteor shower — diagonal streaks crossing the canvas.
 * Strictly monochrome: black on light, white on dark.
 * Respects prefers-reduced-motion.
 */
export function Meteors({ number = 20, className }: MeteorsProps) {
  const reduced = useReducedMotion();
  const meteors = useMemo(
    () =>
      Array.from({ length: number }, () => ({
        top: -5 + Math.random() * 110,
        left: Math.random() * 100,
        delay: Math.random() * 0.6 + 0.2,
        duration: Math.random() * 8 + 4,
      })),
    [number],
  );

  if (reduced) return null;

  return (
    <div className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)} aria-hidden="true">
      {meteors.map((m, i) => (
        <span
          key={i}
          className="meteor absolute h-px w-px rounded-full bg-foreground shadow-[0_0_0_1px_hsl(var(--foreground)/0.15)]"
          style={{
            top: `${m.top}%`,
            left: `${m.left}%`,
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
