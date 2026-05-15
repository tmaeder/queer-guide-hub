import * as React from 'react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface TooltipItem {
  id: string | number;
  name: string;
  designation?: string;
  image?: string;
  initials?: string;
}

interface AnimatedTooltipProps {
  items: TooltipItem[];
  className?: string;
}

/**
 * Aceternity-style AnimatedTooltip — hovering over an avatar reveals a
 * tooltip card that gently rotates with cursor X-position. Monochrome.
 */
export function AnimatedTooltip({ items, className }: AnimatedTooltipProps) {
  const [hoveredId, setHoveredId] = React.useState<string | number | null>(null);
  const x = useMotionValue(0);
  const reduced = useReducedMotion();

  const springConfig = { stiffness: 100, damping: 5 };
  const rotate = useSpring(useTransform(x, [-100, 100], [-30, 30]), springConfig);
  const translateX = useSpring(useTransform(x, [-100, 100], [-30, 30]), springConfig);

  return (
    <div className={cn('flex -space-x-2', className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className="relative group"
          onMouseEnter={() => setHoveredId(item.id)}
          onMouseLeave={() => setHoveredId(null)}
          onMouseMove={(e) => {
            const halfWidth = (e.currentTarget as HTMLDivElement).offsetWidth / 2;
            x.set(e.nativeEvent.offsetX - halfWidth);
          }}
        >
          <AnimatePresence mode="popLayout">
            {!reduced && hoveredId === item.id && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 10 } }}
                exit={{ opacity: 0, y: 10, scale: 0.6 }}
                style={{ translateX, rotate, whiteSpace: 'nowrap' }}
                className="absolute -top-14 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center justify-center rounded-xl bg-foreground text-background px-3 py-1.5 shadow-[var(--shadow-aceternity)]"
              >
                <div className="text-xs font-semibold">{item.name}</div>
                {item.designation && <div className="text-[0.6875rem] opacity-70">{item.designation}</div>}
              </motion.div>
            )}
          </AnimatePresence>
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="object-cover h-10 w-10 rounded-full border-2 border-background relative transition-transform duration-200 group-hover:scale-105 group-hover:z-30"
            />
          ) : (
            <div className="h-10 w-10 rounded-full border-2 border-background bg-muted text-foreground flex items-center justify-center text-xs font-semibold relative transition-transform duration-200 group-hover:scale-105 group-hover:z-30">
              {item.initials || item.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
