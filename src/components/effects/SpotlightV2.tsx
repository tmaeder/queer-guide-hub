import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface SpotlightV2Props {
  className?: string;
  /** Where to anchor the spotlight (default: top-center). */
  anchor?: 'top-center' | 'top-left' | 'top-right' | 'center';
  /** Soft pulsing intensity (0–1). */
  intensity?: number;
}

/**
 * Aceternity-style multi-light Spotlight v2 — two overlapping conic-like
 * radial gradients that breathe, anchored to a chosen edge. Monochrome
 * (foreground at low alpha). Pure CSS — no JS animation tick.
 */
export function SpotlightV2({ className, anchor = 'top-center', intensity = 0.18 }: SpotlightV2Props) {
  const anchors: Record<NonNullable<SpotlightV2Props['anchor']>, { x: string; y: string }> = {
    'top-center': { x: '50%', y: '0%' },
    'top-left': { x: '15%', y: '0%' },
    'top-right': { x: '85%', y: '0%' },
    center: { x: '50%', y: '40%' },
  };
  const a = anchors[anchor];
  return (
    <div className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)} aria-hidden="true">
      <motion.div
        animate={{ opacity: [intensity, intensity * 0.55, intensity] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 75% 50% at ${a.x} ${a.y}, hsl(var(--foreground) / ${intensity}), transparent 60%)`,
          filter: 'blur(40px)',
        }}
      />
      <motion.div
        animate={{ opacity: [intensity * 0.5, intensity, intensity * 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 50% 35% at ${a.x} ${a.y}, hsl(var(--foreground) / ${intensity * 1.2}), transparent 60%)`,
          filter: 'blur(20px)',
        }}
      />
    </div>
  );
}
