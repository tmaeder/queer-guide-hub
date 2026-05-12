import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface InfiniteMovingCardsProps {
  children: React.ReactNode;
  direction?: 'left' | 'right';
  speed?: 'slow' | 'normal' | 'fast';
  pauseOnHover?: boolean;
  className?: string;
}

const speedMap = { slow: '60s', normal: '40s', fast: '20s' };

export function InfiniteMovingCards({
  children,
  direction = 'left',
  speed = 'normal',
  pauseOnHover = true,
  className,
}: InfiniteMovingCardsProps) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (scrollRef.current) setReady(true);
  }, []);

  if (reduced) {
    return (
      <div className={cn('flex gap-4 overflow-x-auto', className)}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden', className)}>
      <div
        ref={scrollRef}
        className={cn(
          'flex gap-4 w-max',
          pauseOnHover && 'hover:[animation-play-state:paused]',
        )}
        style={
          ready
            ? {
                animation: `scroll-${direction} ${speedMap[speed]} linear infinite`,
              }
            : undefined
        }
      >
        {children}
        {children}
      </div>
      <style>{`
        @keyframes scroll-left {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes scroll-right {
          from { transform: translateX(-50%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
