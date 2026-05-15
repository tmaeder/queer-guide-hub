import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface TextRevealCardProps {
  text: string;
  revealText: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Aceternity-style TextRevealCard — hover/drag a vertical handle to reveal
 * a second message overlaid on the first. Monochrome.
 */
export function TextRevealCard({ text, revealText, className, children }: TextRevealCardProps) {
  const [pos, setPos] = React.useState(50);
  const [hovered, setHovered] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div
      ref={ref}
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPos(50);
      }}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      className={cn(
        'relative w-full overflow-hidden rounded-container bg-card border border-border/60 p-8 select-none cursor-ew-resize',
        className,
      )}
    >
      {children}
      <div className="relative h-32 flex items-center justify-center">
        {/* Base text */}
        <p className="text-3xl md:text-5xl font-extrabold text-muted-foreground/40 tracking-tight">{text}</p>
        {/* Reveal text — clipped from the right of the handle */}
        <motion.div
          animate={{ width: hovered ? `${pos}%` : '50%' }}
          transition={{ duration: 0.08 }}
          className="absolute inset-y-0 left-0 overflow-hidden flex items-center justify-start"
        >
          <p className="text-3xl md:text-5xl font-extrabold text-foreground whitespace-nowrap tracking-tight" style={{ width: '100%' }}>
            {revealText}
          </p>
        </motion.div>
        {/* Handle */}
        <motion.div
          animate={{ left: hovered ? `${pos}%` : '50%' }}
          transition={{ duration: 0.08 }}
          className="absolute top-0 bottom-0 w-px bg-foreground/80 pointer-events-none"
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-background border border-foreground shadow-[var(--shadow-aceternity-sm)] flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l-6 6 6 6" />
              <path d="M15 6l6 6-6 6" />
            </svg>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
