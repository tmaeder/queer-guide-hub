import * as React from 'react';
import { cn } from '@/lib/utils';

interface MarqueeProps {
  children: React.ReactNode;
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  speed?: number;
}

/**
 * Aceternity-style marquee — duplicates children and translates infinitely
 * with CSS keyframes. Pauses on hover. Respects reduced-motion via media query.
 */
export function Marquee({
  children,
  className,
  reverse = false,
  pauseOnHover = true,
  speed = 40,
}: MarqueeProps) {
  return (
    <div
      className={cn(
        'group relative flex overflow-hidden [--gap:2rem] gap-[var(--gap)] [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]',
        className,
      )}
    >
      {[0, 1].map((k) => (
        <div
          key={k}
          aria-hidden={k === 1 ? 'true' : undefined}
          className={cn(
            'flex shrink-0 items-center gap-[var(--gap)] motion-reduce:!animation-none',
            pauseOnHover && 'group-hover:[animation-play-state:paused]',
          )}
          style={{
            animationName: reverse ? 'marquee-rev' : 'marquee-fwd',
            animationDuration: `${speed}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
