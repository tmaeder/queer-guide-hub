import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface WavyBackgroundProps {
  className?: string;
  containerClassName?: string;
  waveOpacity?: number;
  speed?: 'slow' | 'fast';
  children?: React.ReactNode;
}

/**
 * Aceternity-style WavyBackground — overlapping sine-wave strokes drifting
 * horizontally. Monochrome (foreground at varying low opacities).
 */
export function WavyBackground({
  className,
  containerClassName,
  waveOpacity = 0.4,
  speed = 'slow',
  children,
}: WavyBackgroundProps) {
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

    const nt = { v: 0 };
    const tickRate = speed === 'fast' ? 0.002 : 0.0008;
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() || '0 0% 4%';

    const draw = () => {
      nt.v += tickRate;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const lines = 5;
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = 'round';
      for (let i = 0; i < lines; i++) {
        ctx.beginPath();
        const alpha = waveOpacity * (1 - i * 0.12);
        ctx.strokeStyle = `hsl(${fg} / ${alpha.toFixed(3)})`;
        for (let x = 0; x <= w; x += 8) {
          const y =
            h / 2 +
            Math.sin(x * 0.005 + nt.v * 6 + i * 0.6) * 40 * dpr +
            Math.cos(x * 0.003 - nt.v * 4 + i * 0.9) * 30 * dpr;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      requestAnimationFrame(draw);
    };
    const id = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', resize);
    };
  }, [waveOpacity, speed, reduced]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', containerClassName)}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
      <div className={cn('relative z-10', className)}>{children}</div>
    </div>
  );
}
