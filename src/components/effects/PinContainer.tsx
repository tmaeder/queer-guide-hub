import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface PinContainerProps {
  children: React.ReactNode;
  title?: string;
  href?: string;
  className?: string;
  containerClassName?: string;
}

/**
 * Aceternity-style 3D pin — on hover, a small floating tag rises above the
 * card with a wired connector. Card itself perspective-tilts slightly.
 * Monochrome.
 */
export function PinContainer({ children, title, href, className, containerClassName }: PinContainerProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <a
      href={href ?? '#'}
      className={cn('relative group/pin z-50 cursor-pointer block', containerClassName)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{ perspective: '1000px', transform: 'rotateX(70deg) translateZ(0)' }}
        className="absolute inset-0 flex items-end justify-center group-hover/pin:opacity-100 opacity-0 transition-opacity"
      >
        <motion.div
          animate={{ scale: hovered ? 1 : 0.7 }}
          className="relative flex items-center justify-center"
        >
          {/* Spike */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-32 bg-foreground/50" />
          {/* Tag */}
          <motion.div
            animate={{ y: hovered ? -90 : -30, opacity: hovered ? 1 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="absolute bottom-0 px-3 py-1 rounded-full bg-foreground text-background text-xs font-medium whitespace-nowrap shadow-[var(--shadow-aceternity)]"
          >
            {title}
          </motion.div>
        </motion.div>
      </div>
      <motion.div
        animate={{ rotateY: hovered ? -3 : 0, rotateX: hovered ? 3 : 0, scale: hovered ? 1.02 : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        className={cn(
          'relative rounded-container border border-border/60 bg-card overflow-hidden',
          className,
        )}
      >
        {children}
      </motion.div>
    </a>
  );
}
