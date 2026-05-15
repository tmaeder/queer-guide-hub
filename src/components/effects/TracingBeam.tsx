import * as React from 'react';
import { motion, useScroll, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface TracingBeamProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Aceternity-style TracingBeam — vertical SVG line that fills with a
 * gradient as the user scrolls through the content. Pinned to the left
 * edge on desktop; hidden under md.
 *
 * Strictly monochrome — the "beam" is a fade from foreground to a soft
 * neutral, anchored by two pulsing dots at top and bottom of the trail.
 */
export function TracingBeam({ children, className }: TracingBeamProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const [svgHeight, setSvgHeight] = React.useState(0);

  React.useEffect(() => {
    if (contentRef.current) {
      setSvgHeight(contentRef.current.offsetHeight);
    }
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSvgHeight(e.target instanceof HTMLElement ? e.target.offsetHeight : 0);
      }
    });
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  const y1 = useSpring(useTransform(scrollYProgress, [0, 0.8], [50, svgHeight]), {
    stiffness: 500,
    damping: 90,
  });
  const y2 = useSpring(useTransform(scrollYProgress, [0, 1], [50, svgHeight - 200]), {
    stiffness: 500,
    damping: 90,
  });

  return (
    <motion.div ref={ref} className={cn('relative w-full', className)}>
      {!reduced && (
        <div className="absolute -left-4 md:-left-20 top-3 hidden md:block">
          <motion.div
            transition={{ duration: 0.2, delay: 0.5 }}
            animate={{
              boxShadow:
                scrollYProgress.get() > 0
                  ? 'none'
                  : 'hsl(var(--foreground) / 0.24) 0px 0px 4px 1px inset, hsl(var(--foreground) / 0.24) 0px 0px 2px',
            }}
            className="ml-[27px] h-4 w-4 rounded-full border border-border bg-background flex items-center justify-center"
          >
            <motion.div
              transition={{ duration: 0.2, delay: 0.5 }}
              animate={{
                backgroundColor: scrollYProgress.get() > 0 ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
                borderColor: scrollYProgress.get() > 0 ? 'hsl(var(--border))' : 'hsl(var(--foreground))',
              }}
              className="h-2 w-2 rounded-full border border-foreground bg-foreground"
            />
          </motion.div>
          <svg
            viewBox={`0 0 20 ${svgHeight}`}
            width="20"
            height={svgHeight}
            className="ml-4 block"
            aria-hidden="true"
          >
            <motion.path
              d={`M 1 0 V -36 l 18 24 V ${svgHeight * 0.8} l -18 24 V ${svgHeight}`}
              fill="none"
              stroke="hsl(var(--foreground) / 0.12)"
              strokeWidth="1.25"
            />
            <motion.path
              d={`M 1 0 V -36 l 18 24 V ${svgHeight * 0.8} l -18 24 V ${svgHeight}`}
              fill="none"
              stroke="url(#tracing-gradient)"
              strokeWidth="1.25"
            />
            <defs>
              <motion.linearGradient
                id="tracing-gradient"
                gradientUnits="userSpaceOnUse"
                x1="0"
                x2="0"
                y1={y1}
                y2={y2}
              >
                <stop stopColor="hsl(var(--foreground))" stopOpacity="0" />
                <stop stopColor="hsl(var(--foreground))" />
                <stop offset="0.325" stopColor="hsl(var(--foreground))" />
                <stop offset="1" stopColor="hsl(var(--foreground))" stopOpacity="0" />
              </motion.linearGradient>
            </defs>
          </svg>
        </div>
      )}
      <div ref={contentRef}>{children}</div>
    </motion.div>
  );
}
