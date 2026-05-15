import * as React from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  href: string;
  imageSrc?: string;
  children: React.ReactNode;
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Aceternity-style LinkPreview — on hover, an image preview card floats
 * above the cursor and tilts with horizontal movement. No iframe — caller
 * supplies a static image (avoids third-party screenshot APIs).
 */
export function LinkPreview({
  href,
  imageSrc,
  children,
  className,
  width = 220,
  height = 130,
}: LinkPreviewProps) {
  const [hovered, setHovered] = React.useState(false);
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 100, damping: 12 });
  const rotate = useTransform(springX, [-100, 100], [-10, 10]);
  const translateX = useTransform(springX, [-100, 100], [-50, 50]);
  const reduced = useReducedMotion();

  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      className={cn(
        'relative inline-block underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground transition-colors',
        className,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as HTMLAnchorElement).getBoundingClientRect();
        const halfW = rect.width / 2;
        const rel = e.nativeEvent.offsetX - halfW;
        x.set(rel);
      }}
    >
      {children}
      <AnimatePresence>
        {hovered && !reduced && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ x: translateX, rotate, whiteSpace: 'nowrap' }}
            className="absolute left-1/2 -top-[160px] -translate-x-1/2 pointer-events-none z-50"
          >
            <div
              className="overflow-hidden rounded-container bg-card border border-border/60 shadow-[var(--shadow-aceternity)]"
              style={{ width, height }}
            >
              {imageSrc ? (
                <img src={imageSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-grid-dots flex items-center justify-center text-xs text-muted-foreground">
                  {new URL(href, 'http://x').host || href}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </a>
  );
}
