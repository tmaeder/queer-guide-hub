import * as React from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface FollowingPointerProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
}

/**
 * Aceternity-style FollowingPointer — hides the system cursor over the
 * wrapped area and replaces it with a labelled monochrome arrow that
 * spring-follows the pointer. Good for cards / images that want a custom
 * "click me" affordance.
 */
export function FollowingPointer({ children, className, title = 'View' }: FollowingPointerProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 600, damping: 30 });
  const sy = useSpring(y, { stiffness: 600, damping: 30 });
  const [visible, setVisible] = React.useState(false);
  const reduced = useReducedMotion();

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onMouseMove={onMove}
      className={cn('relative', !reduced && 'cursor-none', className)}
    >
      {children}
      <AnimatePresence>
        {visible && !reduced && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            style={{ left: sx, top: sy }}
            className="pointer-events-none absolute z-50 translate-x-0 translate-y-0"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" className="text-foreground -translate-x-[2px] -translate-y-[2px]">
              <path
                d="M2.717 2.137a.75.75 0 0 1 .937-.937l9.5 3.25a.75.75 0 0 1 .106 1.375l-3.81 1.905-1.905 3.81a.75.75 0 0 1-1.376-.106l-3.25-9.5Z"
                fill="currentColor"
              />
            </svg>
            <motion.span
              layout
              className="absolute left-3 top-3 inline-flex items-center whitespace-nowrap rounded-element bg-foreground text-background px-2 py-0.5 text-xs font-medium shadow-[var(--shadow-aceternity-sm)]"
            >
              {title}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
