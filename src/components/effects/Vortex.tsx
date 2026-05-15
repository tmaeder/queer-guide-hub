import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface VortexProps {
  particleCount?: number;
  rangeY?: number;
  baseSpeed?: number;
  className?: string;
}

/**
 * Aceternity-style Vortex — canvas particle field swirling around a center
 * point with sinusoidal trails. Strictly monochrome (foreground color).
 * Bails on reduced-motion. Pause on document visibility hidden.
 */
export function Vortex({
  particleCount = 360,
  rangeY = 100,
  baseSpeed = 0.4,
  className,
}: VortexProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const fg = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() || '0 0% 4%';
    type P = { x: number; y: number; vx: number; vy: number; life: number; ttl: number; speed: number; r: number; hue: number };
    const TAU = Math.PI * 2;

    const particles: P[] = Array.from({ length: particleCount }, () => spawn());
    function spawn(): P {
      const cx = canvas!.width / 2;
      const cy = canvas!.height / 2;
      const angle = Math.random() * TAU;
      const dist = Math.random() * Math.min(canvas!.width, canvas!.height) * 0.4;
      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist + (Math.random() * 2 - 1) * rangeY,
        vx: 0,
        vy: 0,
        life: 0,
        ttl: 120 + Math.random() * 200,
        speed: baseSpeed + Math.random() * 0.4,
        r: 0.4 + Math.random() * 0.6,
        hue: 0,
      };
    }

    let rafId = 0;
    const tick = () => {
      ctx.fillStyle = 'hsl(var(--background) / 0.18)';
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      for (const p of particles) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        p.vx = p.vx * 0.9 + Math.cos(angle) * p.speed * 0.4;
        p.vy = p.vy * 0.9 + Math.sin(angle) * p.speed * 0.4;
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        const alpha = Math.min(1, p.life / 30) * (1 - p.life / p.ttl);
        ctx.fillStyle = `hsl(${fg} / ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * dpr, 0, TAU);
        ctx.fill();

        if (p.life >= p.ttl || p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          Object.assign(p, spawn());
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    tick();

    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(rafId);
      else rafId = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [particleCount, rangeY, baseSpeed, reduced]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 w-full h-full pointer-events-none', className)}
      aria-hidden="true"
    />
  );
}
