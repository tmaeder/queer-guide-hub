import * as React from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface CardContainer3DProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  rotateRange?: number;
}

const ParallaxContext = React.createContext<{
  rx: ReturnType<typeof useSpring> | null;
  ry: ReturnType<typeof useSpring> | null;
  active: boolean;
}>({ rx: null, ry: null, active: false });

/**
 * Aceternity-style 3D card container — perspective tilt that follows the
 * cursor. Use with <CardItem translateZ={…}> to lift inner pieces above
 * the surface for proper parallax depth.
 */
export function CardContainer3D({
  children,
  className,
  containerClassName,
  rotateRange = 12,
}: CardContainer3DProps) {
  const reduced = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [rotateRange, -rotateRange]), { stiffness: 200, damping: 22 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-rotateRange, rotateRange]), { stiffness: 200, damping: 22 });
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [active, setActive] = React.useState(false);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <ParallaxContext.Provider value={{ rx, ry, active }}>
      <div
        className={cn('flex items-center justify-center', containerClassName)}
        style={{ perspective: '1000px' }}
      >
        <motion.div
          ref={ref}
          onMouseEnter={() => setActive(true)}
          onMouseLeave={() => {
            setActive(false);
            mx.set(0);
            my.set(0);
          }}
          onMouseMove={handleMove}
          style={reduced ? undefined : { rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
          className={cn('relative transition-transform duration-200', className)}
        >
          {children}
        </motion.div>
      </div>
    </ParallaxContext.Provider>
  );
}

interface CardItemProps extends React.HTMLAttributes<HTMLDivElement> {
  translateZ?: number;
  as?: keyof React.JSX.IntrinsicElements;
  children: React.ReactNode;
}

/**
 * Inner element of CardContainer3D — lift this above the card surface by
 * `translateZ` px so it feels three-dimensional.
 */
export function CardItem({ translateZ = 0, as = 'div', className, children, ...props }: CardItemProps) {
  const reduced = useReducedMotion();
  const Comp = motion[as as keyof typeof motion] as typeof motion.div;
  return (
    <Comp
      {...props}
      style={reduced ? undefined : { transform: `translateZ(${translateZ}px)` }}
      className={cn('transition-transform duration-200', className)}
    >
      {children}
    </Comp>
  );
}
