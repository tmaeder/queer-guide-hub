import * as React from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ContainerScrollProps {
  titleComponent?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Aceternity-style ContainerScroll — title shrinks while a perspective
 * "screenshot" panel rotates from a tilted state into a flat upright
 * position as the user scrolls. Monochrome chrome on the panel.
 */
export function ContainerScroll({ titleComponent, children, className }: ContainerScrollProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: containerRef });

  const rotate = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [20, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1.05, 1]);
  const translate = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, -100]);
  const titleScale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1, 0.95]);

  return (
    <div
      ref={containerRef}
      className={cn('h-[60rem] md:h-[80rem] flex items-center justify-center relative p-2 md:p-20', className)}
    >
      <div className="py-10 md:py-40 w-full relative" style={{ perspective: '1000px' }}>
        <motion.div style={{ translateY: translate, scale: titleScale }} className="max-w-5xl mx-auto text-center">
          {titleComponent}
        </motion.div>
        <motion.div
          style={{
            rotateX: rotate,
            scale,
            boxShadow:
              '0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003',
          }}
          className="max-w-5xl -mt-12 mx-auto h-[30rem] md:h-[40rem] w-full border border-border/60 bg-muted/40 rounded-[30px] backdrop-blur-md p-2 md:p-6 shadow-[var(--shadow-aceternity-lg)]"
        >
          <div className="h-full w-full overflow-hidden rounded-2xl bg-background md:rounded-2xl md:p-4">
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
