import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface SparklesProps {
  density?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
}

/**
 * Aceternity-style sparkle field — canvas-rendered drifting particles.
 * Monochrome (foreground color on background). Cheap; bails on reduced-motion.
 */
export function Sparkles({
  density = 60,
  minSize = 0.6,
  maxSize = 1.8,
  className,
}: SparklesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();

    // Read foreground color from CSS variables once per frame batch.
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() || '0 0% 4%';

    type Particle = { x: number; y: number; r: number; vx: number; vy: number; tw: number };
    const particles: Particle[] = Array.from({ length: density }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (minSize + Math.random() * (maxSize - minSize)) * dpr,
      vx: (Math.random() - 0.5) * 0.15 * dpr,
      vy: (Math.random() - 0.5) * 0.15 * dpr,
      tw: Math.random() * Math.PI * 2,
    }));

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.03;
        if (p.x < 0) p.x += canvas.width;
        if (p.x > canvas.width) p.x -= canvas.width;
        if (p.y < 0) p.y += canvas.height;
        if (p.y > canvas.height) p.y -= canvas.height;
        const alpha = 0.35 + 0.45 * Math.sin(p.tw);
        ctx.fillStyle = `hsl(${fg} / ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [density, minSize, maxSize, reduced]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 w-full h-full pointer-events-none', className)}
      aria-hidden="true"
    />
  );
}
