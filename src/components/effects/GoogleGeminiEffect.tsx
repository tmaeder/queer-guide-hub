import * as React from 'react';
import { motion, useTransform, type MotionValue } from 'motion/react';
import { cn } from '@/lib/utils';

interface GoogleGeminiEffectProps {
  pathLengths: MotionValue<number>[];
  title?: string;
  description?: React.ReactNode;
  className?: string;
}

/**
 * Aceternity-style GoogleGeminiEffect — four flowing SVG paths drawn by
 * scroll progress (caller passes MotionValue<number>[] of length 5).
 * Monochrome strokes.
 */
export function GoogleGeminiEffect({
  pathLengths,
  title,
  description,
  className,
}: GoogleGeminiEffectProps) {
  return (
    <div className={cn('sticky top-80 relative', className)}>
      <p className="text-2xl md:text-7xl font-extrabold pb-4 text-center tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60">
        {title || `Build with Aceternity UI`}
      </p>
      <p className="text-xs md:text-xl font-normal text-center text-muted-foreground mt-4 max-w-lg mx-auto">
        {description || ''}
      </p>
      <div className="w-full h-[890px] -top-60 md:-top-40 flex items-center justify-center bg-background absolute" />
      <svg
        width="1440"
        height="890"
        viewBox="0 0 1440 890"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute -top-60 md:-top-40 w-full"
      >
        <motion.path
          d="M0 663C145.5 663 191 666.5 269 626C314 603 343.5 588 392.5 564.5C407.5 558 459 535 478 526.5C507.5 514.5 528.5 503 555.5 482C580 463.5 599 443.5 616.5 426C634 408 658.5 384 689 358C724 328 743 305 781 277C828 244 864 226.5 905.5 209C945.5 192 988 178.5 1041 175C1100.5 171.5 1136 175 1173 196.5C1207.5 217 1227.5 247 1242.5 281C1257.5 314 1262 354 1262 414.5C1262 487 1242.5 644 1242.5 644L1440 663"
          stroke="hsl(var(--foreground) / 0.7)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          style={{ pathLength: pathLengths[0] }}
        />
        <motion.path
          d="M0 587C145.5 587 191 590.5 269 550C314 527 343.5 512 392.5 488.5C407.5 482 459 459 478 450.5C507.5 438.5 528.5 427 555.5 406C580 387.5 599 367.5 616.5 350C634 332 658.5 308 689 282C724 252 743 229 781 201C828 168 864 150.5 905.5 133C945.5 116 988 102.5 1041 99C1100.5 95.5 1136 99 1173 120.5C1207.5 141 1227.5 171 1242.5 205C1257.5 238 1262 278 1262 338.5C1262 411 1242.5 568 1242.5 568L1440 587"
          stroke="hsl(var(--foreground) / 0.5)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          style={{ pathLength: pathLengths[1] }}
        />
        <motion.path
          d="M0 514C145.5 514 191 517.5 269 477C314 454 343.5 439 392.5 415.5C407.5 409 459 386 478 377.5C507.5 365.5 528.5 354 555.5 333C580 314.5 599 294.5 616.5 277C634 259 658.5 235 689 209C724 179 743 156 781 128C828 95 864 77.5 905.5 60C945.5 43 988 29.5 1041 26C1100.5 22.5 1136 26 1173 47.5C1207.5 68 1227.5 98 1242.5 132C1257.5 165 1262 205 1262 265.5C1262 338 1242.5 495 1242.5 495L1440 514"
          stroke="hsl(var(--foreground) / 0.4)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          style={{ pathLength: pathLengths[2] }}
        />
        <motion.path
          d="M0 740C145.5 740 191 743.5 269 703C314 680 343.5 665 392.5 641.5C407.5 635 459 612 478 603.5C507.5 591.5 528.5 580 555.5 559C580 540.5 599 520.5 616.5 503C634 485 658.5 461 689 435C724 405 743 382 781 354C828 321 864 303.5 905.5 286C945.5 269 988 255.5 1041 252C1100.5 248.5 1136 252 1173 273.5C1207.5 294 1227.5 324 1242.5 358C1257.5 391 1262 431 1262 491.5C1262 564 1242.5 721 1242.5 721L1440 740"
          stroke="hsl(var(--foreground) / 0.25)"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          style={{ pathLength: pathLengths[3] }}
        />
      </svg>
    </div>
  );
}

/** Convenience: 5 path MotionValues bound to a single scrollYProgress 0→1. */
export function useGeminiPaths(scrollYProgress: MotionValue<number>): MotionValue<number>[] {
  return [
    useTransform(scrollYProgress, [0, 0.8], [0.2, 1.2]),
    useTransform(scrollYProgress, [0, 0.8], [0.15, 1.2]),
    useTransform(scrollYProgress, [0, 0.8], [0.1, 1.2]),
    useTransform(scrollYProgress, [0, 0.8], [0.05, 1.2]),
    useTransform(scrollYProgress, [0, 0.8], [0, 1.2]),
  ];
}
