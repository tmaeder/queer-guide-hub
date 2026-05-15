import * as React from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface GlowingEffectProps {
  /** Radius in px of the soft glow following the cursor inside the parent. */
  blur?: number;
  /** Stroke width of the inner border that the glow paints onto. */
  borderWidth?: number;
  /** Spread distance of the glow gradient, in px. */
  spread?: number;
  /** Container className. */
  className?: string;
  /** Mode: 'card' paints glow into a 1px border inset; 'spotlight' fills bg. */
  variant?: 'card' | 'spotlight';
  /** Glow intensity 0–1. */
  intensity?: number;
}

/**
 * Aceternity-style GlowingEffect — radial monochrome glow that follows the
 * cursor through the nearest scrollable / mouseover-able parent. Pairs with
 * a relative+rounded parent. In 'card' mode it paints onto a thin inner
 * border; in 'spotlight' mode it fills the surface.
 */
export function GlowingEffect({
  blur = 80,
  borderWidth = 1,
  spread = 220,
  className,
  variant = 'card',
  intensity = 0.35,
}: GlowingEffectProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (reduced) return;
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
    };
    const onLeave = () => setPos((p) => ({ ...p, visible: false }));
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [reduced]);

  if (reduced) return null;

  const bg = `radial-gradient(${spread}px circle at ${pos.x}px ${pos.y}px, hsl(var(--foreground) / ${intensity}), transparent 60%)`;

  if (variant === 'spotlight') {
    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        className={cn('pointer-events-none absolute inset-0 transition-opacity duration-300', className)}
        style={{
          opacity: pos.visible ? 1 : 0,
          background: bg,
          filter: `blur(${blur / 4}px)`,
        }}
      />
    );
  }

  // 'card' — inner ring that reveals under cursor.
  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300', className)}
      style={{
        opacity: pos.visible ? 1 : 0,
        padding: borderWidth,
        background: bg,
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
      }}
    />
  );
}
