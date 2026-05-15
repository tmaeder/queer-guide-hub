import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ShootingStarsProps {
  minSpeed?: number;
  maxSpeed?: number;
  minDelay?: number;
  maxDelay?: number;
  trailLength?: number;
  className?: string;
}

/**
 * Aceternity-style ShootingStars — SVG-rendered streaks with a fading
 * trail. Streaks fire from random off-canvas origins and travel diagonally.
 * Monochrome.
 */
export function ShootingStars({
  minSpeed = 8,
  maxSpeed = 18,
  minDelay = 1200,
  maxDelay = 4400,
  trailLength = 80,
  className,
}: ShootingStarsProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const svg = svgRef.current;
    if (!svg) return;
    let cancelled = false;
    let timeoutId: number;

    const spawn = () => {
      if (cancelled || !svg) return;
      const rect = svg.getBoundingClientRect();
      const startX = -50;
      const startY = Math.random() * rect.height;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      const angle = (Math.random() * 12 + 24) * (Math.PI / 180);

      let x = startX;
      let y = startY;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', 'url(#shooting-grad)');
      line.setAttribute('stroke-width', '1.4');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);

      const step = () => {
        x += dx;
        y += dy;
        line.setAttribute('x1', `${x - Math.cos(angle) * trailLength}`);
        line.setAttribute('y1', `${y - Math.sin(angle) * trailLength}`);
        line.setAttribute('x2', `${x}`);
        line.setAttribute('y2', `${y}`);
        if (x < rect.width + trailLength && y < rect.height + trailLength) {
          requestAnimationFrame(step);
        } else {
          line.remove();
        }
      };
      requestAnimationFrame(step);

      timeoutId = window.setTimeout(spawn, minDelay + Math.random() * (maxDelay - minDelay));
    };

    timeoutId = window.setTimeout(spawn, minDelay);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [minSpeed, maxSpeed, minDelay, maxDelay, trailLength, reduced]);

  return (
    <svg
      ref={svgRef}
      className={cn('absolute inset-0 w-full h-full pointer-events-none', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shooting-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0.9" />
        </linearGradient>
      </defs>
    </svg>
  );
}
