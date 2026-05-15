import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface BoxesProps {
  className?: string;
  rows?: number;
  cols?: number;
}

/**
 * Aceternity-style Boxes — interactive grid of monochrome boxes that flash
 * to a brighter foreground tint on hover. Lightweight enough to use as a
 * full-section backdrop.
 */
export function Boxes({ className, rows = 30, cols = 30 }: BoxesProps) {
  return (
    <div
      style={{
        transform: 'translate(-40%,-60%) skewX(-48deg) skewY(14deg) scale(0.675) rotate(0deg) translateZ(0)',
      }}
      className={cn('absolute -top-1/4 left-1/4 z-0 flex h-full w-full -translate-x-1/2 -translate-y-1/2 p-4', className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`row-${i}`} className="relative h-8 w-16 border-l border-foreground/10">
          {Array.from({ length: cols }).map((_, j) => (
            <motion.div
              whileHover={{
                backgroundColor: 'hsl(var(--foreground) / 0.12)',
                transition: { duration: 0 },
              }}
              animate={{ transition: { duration: 2 } }}
              key={`col-${j}`}
              className="relative h-8 w-16 border-t border-r border-foreground/10"
            >
              {j % 2 === 0 && i % 2 === 0 ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="absolute -top-[14px] -left-[22px] h-6 w-10 text-foreground/15 stroke-[1px] pointer-events-none"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
              ) : null}
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  );
}
