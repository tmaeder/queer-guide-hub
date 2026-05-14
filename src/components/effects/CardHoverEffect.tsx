import { useRef, useState, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/motion';
import { isLowEndDevice } from '@/lib/animation';

interface CardHoverEffectProps {
  children: React.ReactNode;
  className?: string;
  tiltAmount?: number;
  spotlightSize?: number;
}

export function CardHoverEffect({
  children,
  className,
  tiltAmount = 6,
  spotlightSize = 250,
}: CardHoverEffectProps) {
  const reduced = useReducedMotion();
  const lowEnd = typeof window !== 'undefined' && isLowEndDevice();
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [spotlight, setSpotlight] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current || reduced || lowEnd) return;
      const rect = cardRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const rotateX = ((e.clientY - centerY) / (rect.height / 2)) * -tiltAmount;
      const rotateY = ((e.clientX - centerX) / (rect.width / 2)) * tiltAmount;
      setTilt({ x: rotateX, y: rotateY });
      setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [reduced, lowEnd, tiltAmount],
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  if (reduced || lowEnd) {
    return (
      <div className={cn('rounded-xl transition-opacity hover:opacity-85', className)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      className={cn('relative overflow-hidden rounded-xl', className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      animate={{
        rotateX: tilt.x,
        rotateY: tilt.y,
        transformPerspective: 800,
      }}
      transition={springs.snappy}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none z-10"
        animate={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(${spotlightSize}px circle at ${spotlight.x}px ${spotlight.y}px, hsl(var(--foreground) / 0.04), transparent 60%)`,
        }}
        transition={{ opacity: { duration: 0.2 }, background: { duration: 0 } }}
      />
      {children}
    </motion.div>
  );
}
