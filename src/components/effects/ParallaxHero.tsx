import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';

interface ParallaxHeroProps {
  children: React.ReactNode;
  className?: string;
  overlayFrom?: number;
  overlayTo?: number;
}

export function ParallaxHero({
  children,
  className,
  overlayFrom = 0,
  overlayTo = 0.4,
}: ParallaxHeroProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [1.05, 1]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 1], [overlayFrom, overlayTo]);

  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)}>
      <motion.div
        style={{ scale }}
        className="w-full h-full"
        initial={{ clipPath: 'inset(8% 12% 8% 12%)' }}
        animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-foreground pointer-events-none"
        style={{ opacity: overlayOpacity }}
      />
    </div>
  );
}
