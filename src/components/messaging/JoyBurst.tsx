import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useMotionTokens } from '@/lib/motion';
import { isLowEndDevice } from '@/lib/animation';

interface JoyBurstProps {
  /** Called once the burst finishes so the parent can unmount it. */
  onDone: () => void;
}

const COUNT = 40;
// The one place rainbow is sanctioned in chat chrome — a queer-joy celebration.
const COLORS = [
  'var(--accent-brand)',
  '#e40303',
  '#ff8c00',
  '#ffed00',
  '#008026',
  '#004dff',
  '#750787',
];

/**
 * A one-shot, full-pane confetti celebration for queer-joy milestones (a new
 * match's first message, mutual photo unlock). Documented motion exception for
 * /messages only: fully gated behind reduced-motion + low-end device,
 * aria-hidden, auto-unmounts after ~1.2s. Never imported by safety routes.
 */
export function JoyBurst({ onDone }: JoyBurstProps) {
  const { reduced } = useMotionTokens();
  const disabled = reduced || isLowEndDevice();

  const pieces = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        left: (i * 97) % 100,
        delay: (i % 8) * 0.04,
        drift: ((i % 5) - 2) * 18,
        rot: (i % 2 ? 1 : -1) * (180 + (i % 4) * 90),
        color: COLORS[i % COLORS.length],
        size: 6 + (i % 3) * 3,
      })),
    [],
  );

  useEffect(() => {
    if (disabled) {
      onDone();
      return;
    }
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [disabled, onDone]);

  if (disabled) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 1, y: -12, x: 0, rotate: 0 }}
          animate={{ opacity: 0, y: '110%', x: p.drift, rotate: p.rot }}
          transition={{ duration: 1.1, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-0 rounded-badge"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}
