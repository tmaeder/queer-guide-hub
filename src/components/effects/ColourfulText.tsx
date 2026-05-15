import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ColourfulTextProps {
  text: string;
  className?: string;
  /** ms between each tone shift across the letters. */
  interval?: number;
}

/**
 * Aceternity-style ColourfulText — letters cycle through a sequence of
 * monochrome opacities and weights for a subtle kinetic typography effect.
 * (B&W contract — no chromatic colors.)
 */
export function ColourfulText({ text, className, interval = 5000 }: ColourfulTextProps) {
  const [tick, setTick] = React.useState(0);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [interval, reduced]);

  const tones = [
    'hsl(var(--foreground))',
    'hsl(var(--foreground) / 0.6)',
    'hsl(var(--foreground) / 0.85)',
    'hsl(var(--foreground) / 0.45)',
    'hsl(var(--foreground))',
  ];

  return (
    <span className={cn('inline-flex', className)}>
      {text.split('').map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          animate={{
            color: reduced ? 'hsl(var(--foreground))' : tones[(tick + i) % tones.length],
            y: reduced ? 0 : [0, -2, 0],
            scale: reduced ? 1 : [1, 1.05, 1],
          }}
          transition={{
            duration: 0.6,
            ease: [0.22, 1, 0.36, 1],
            delay: (i % 6) * 0.04,
          }}
          className="inline-block"
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </span>
  );
}
