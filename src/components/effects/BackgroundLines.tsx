import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface BackgroundLinesProps {
  className?: string;
}

/**
 * Aceternity-style BackgroundLines — animated stroked SVG paths drifting
 * across the canvas. Monochrome stroke, sub-15% opacity. Use as a section
 * backdrop, never above interactive content.
 */
export function BackgroundLines({ className }: BackgroundLinesProps) {
  const reduced = useReducedMotion();
  const paths = [
    'M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875',
    'M-373 -197C-373 -197 -305 208 159 335C623 462 691 867 691 867',
    'M-366 -205C-366 -205 -298 200 166 327C630 454 698 859 698 859',
    'M-359 -213C-359 -213 -291 192 173 319C637 446 705 851 705 851',
    'M-352 -221C-352 -221 -284 184 180 311C644 438 712 843 712 843',
    'M-345 -229C-345 -229 -277 176 187 303C651 430 719 835 719 835',
  ];

  return (
    <div className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)} aria-hidden="true">
      <svg viewBox="0 0 696 316" fill="none" className="absolute inset-0 w-full h-full">
        {paths.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            stroke="hsl(var(--foreground) / 0.12)"
            strokeWidth="0.6"
            strokeOpacity={0.6}
            initial={reduced ? false : { pathLength: 0.3, opacity: 0.4 }}
            animate={
              reduced
                ? { pathLength: 1, opacity: 0.4 }
                : { pathLength: 1, opacity: [0.3, 0.7, 0.3] }
            }
            transition={{
              duration: 6 + i * 0.5,
              repeat: reduced ? 0 : Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </svg>
    </div>
  );
}
