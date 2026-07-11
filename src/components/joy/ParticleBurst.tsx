import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useMotionTokens } from '@/lib/motion';
import { isLowEndDevice } from '@/lib/animation';

interface ParticleBurstProps {
  /** Called once the burst finishes so the parent can unmount it. */
  onDone: () => void;
}

const PARTICLES = 8;
// Monochrome squares — celebration reads through motion + density, not hue.
const COLORS = [
  'hsl(var(--foreground))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--border))',
];

/**
 * A short, one-shot radial burst of monochrome squares — the queer-joy
 * micro-moment for saving/favoriting from a homepage rail (same mechanics as
 * the /messages ReactionBurst, glyph-free). Sanctioned motion exception for
 * the joy zone (messages, groups, dating, homepage): fully gated behind
 * reduced-motion + low-end device, aria-hidden, auto-unmounts.
 */
export function ParticleBurst({ onDone }: ParticleBurstProps) {
  const { reduced } = useMotionTokens();
  const disabled = reduced || isLowEndDevice();

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PARTICLES + (i % 2 ? 0.3 : 0);
        const dist = 26 + (i % 3) * 10;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 10,
          rot: (i - PARTICLES / 2) * 20,
          color: COLORS[i % COLORS.length],
          size: 4 + (i % 3),
        };
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
          className="absolute left-1/2 top-1/2 rounded-badge"
          style={{
            translateX: '-50%',
            translateY: '-50%',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}
