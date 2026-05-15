import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface BeamsProps {
  count?: number;
  className?: string;
}

/**
 * Pulsing vertical beams — Aceternity-style background ornament.
 * Monochrome only. Beams travel top → bottom with soft falloff.
 */
export function Beams({ count = 7, className }: BeamsProps) {
  const reduced = useReducedMotion();
  const beams = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: ((i + 1) / (count + 1)) * 100 + (Math.random() * 4 - 2),
        delay: i * 0.4 + Math.random() * 0.6,
        duration: 5 + Math.random() * 3,
      })),
    [count],
  );

  if (reduced) return null;

  return (
    <div className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)} aria-hidden="true">
      {beams.map((b, i) => (
        <span
          key={i}
          className="beam"
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
