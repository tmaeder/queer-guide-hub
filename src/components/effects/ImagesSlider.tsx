import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ImagesSliderProps {
  images: string[];
  children?: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  autoplay?: boolean;
  interval?: number;
}

/**
 * Aceternity-style ImagesSlider — auto-rotating image carousel with blur +
 * fade + soft black overlay. Children are rendered above the active image.
 */
export function ImagesSlider({
  images,
  children,
  className,
  overlayClassName,
  autoplay = true,
  interval = 5000,
}: ImagesSliderProps) {
  const [active, setActive] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (!autoplay || reduced) return;
    const id = setInterval(() => setActive((i) => (i + 1) % images.length), interval);
    return () => clearInterval(id);
  }, [autoplay, interval, images.length, reduced]);

  // Preload
  React.useEffect(() => {
    const promises = images.map(
      (src) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.src = src;
          img.onload = () => res();
          img.onerror = () => res();
        }),
    );
    Promise.all(promises).then(() => setLoaded(true));
  }, [images]);

  return (
    <div className={cn('relative w-full h-full overflow-hidden', className)}>
      {loaded && (
        <AnimatePresence>
          <motion.img
            key={active}
            src={images[active]}
            alt=""
            initial={reduced ? false : { opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </AnimatePresence>
      )}
      <div className={cn('absolute inset-0 bg-black/40', overlayClassName)} aria-hidden="true" />
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  );
}
