import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface CompareProps {
  firstImage: string;
  secondImage: string;
  firstAlt: string;
  secondAlt: string;
  className?: string;
}

/**
 * Aceternity-style Compare — drag-to-reveal before/after image slider.
 * Pure clip-path, no canvas. Strictly monochrome chrome on the handle.
 */
export function Compare({ firstImage, secondImage, firstAlt, secondAlt, className }: CompareProps) {
  const [pos, setPos] = React.useState(50);
  const ref = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const onMove = React.useCallback(
    (clientX: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      setPos(pct);
    },
    [],
  );

  React.useEffect(() => {
    if (!dragging) return;
    const onMM = (e: MouseEvent) => onMove(e.clientX);
    const onMU = () => setDragging(false);
    const onTM = (e: TouchEvent) => onMove(e.touches[0].clientX);
    const onTU = () => setDragging(false);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup', onMU);
    window.addEventListener('touchmove', onTM);
    window.addEventListener('touchend', onTU);
    return () => {
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', onMU);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend', onTU);
    };
  }, [dragging, onMove]);

  return (
    <div
      ref={ref}
      className={cn('relative w-full rounded-2xl overflow-hidden select-none', className)}
      onMouseDown={(e) => {
        setDragging(true);
        onMove(e.clientX);
      }}
      onTouchStart={(e) => {
        setDragging(true);
        onMove(e.touches[0].clientX);
      }}
    >
      <img src={firstImage} alt={firstAlt} className="block w-full h-full object-cover" />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
      >
        <img src={secondImage} alt={secondAlt} className="block w-full h-full object-cover" />
      </div>
      <motion.div
        className="absolute top-0 bottom-0 w-px bg-foreground/80 cursor-ew-resize"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-9 w-9 rounded-full bg-background border border-foreground shadow-[var(--shadow-aceternity)] flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l-6 6 6 6" />
            <path d="M15 6l6 6-6 6" />
          </svg>
        </div>
      </motion.div>
    </div>
  );
}
