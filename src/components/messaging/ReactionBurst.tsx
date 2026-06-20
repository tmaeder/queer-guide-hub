import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useMotionTokens } from '@/lib/motion';
import { isLowEndDevice } from '@/lib/animation';

interface ReactionBurstProps {
  emoji: string;
  /** Called once the burst finishes so the parent can unmount it. */
  onDone: () => void;
}

const PARTICLES = 8;

/**
 * A short, one-shot particle burst of an emoji — the queer-joy micro-moment for
 * adding a reaction. Documented motion exception for /messages only: fully
 * gated behind reduced-motion + low-end device, aria-hidden, auto-unmounts.
 */
export function ReactionBurst({ emoji, onDone }: ReactionBurstProps) {
  const { reduced } = useMotionTokens();
  const disabled = reduced || isLowEndDevice();

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PARTICLES + (i % 2 ? 0.3 : 0);
        const dist = 26 + (i % 3) * 10;
        return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 10, rot: (i - PARTICLES / 2) * 20 };
      }),
    [],
  );

  useEffect(() => {
    if (disabled) {
      onDone();
      return;
    }
    const t = setTimeout(onDone, 700);
    return () => clearTimeout(t);
  }, [disabled, onDone]);

  if (disabled) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-visible">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.6, rotate: 0 }}
          animate={{ opacity: 0, x: p.x, y: p.y, scale: 1.1, rotate: p.rot }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-1/2 top-1/2 text-sm"
          style={{ translateX: '-50%', translateY: '-50%' }}
        >
          {emoji}
        </motion.span>
      ))}
    </div>
  );
}
