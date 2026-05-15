import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface WorldArc {
  start: { lat: number; lng: number; label?: string };
  end: { lat: number; lng: number; label?: string };
}

interface WorldMapProps {
  dots?: WorldArc[];
  className?: string;
}

// Equirectangular projection — simple lat/lng → x/y mapping.
function project(lng: number, lat: number, w: number, h: number) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

function arcPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = Math.min(a.y, b.y) - Math.abs(b.x - a.x) * 0.2 - 30;
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}

/**
 * Aceternity-style WorldMap — dotted SVG world (procedural grid of dots
 * masked by continental shapes is heavy; we approximate by drawing a
 * uniform grid of dots and overlaying animated arcs between supplied
 * coordinates). Monochrome.
 */
export function WorldMap({ dots = [], className }: WorldMapProps) {
  const w = 1000;
  const h = 500;
  // Procedural dot grid every 12px — feels "global map" without shipping a topojson.
  const dotGrid = React.useMemo(() => {
    const arr: { x: number; y: number }[] = [];
    for (let y = 0; y < h; y += 14) {
      for (let x = 0; x < w; x += 14) {
        // Cheap mask: weight dots toward visible-land latitudes (rough).
        const lat = 90 - (y / h) * 180;
        const lng = (x / w) * 360 - 180;
        const continental =
          (lng > -170 && lng < -50 && lat > -60 && lat < 75) || // Americas
          (lng > -30 && lng < 60 && lat > -40 && lat < 75) || // Africa + Europe
          (lng > 60 && lng < 180 && lat > -50 && lat < 75); // Asia + Oceania
        if (continental && Math.random() > 0.55) arr.push({ x, y });
      }
    }
    return arr;
  }, []);

  return (
    <div className={cn('relative w-full aspect-[2/1]', className)} aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full">
        {dotGrid.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="1.2" fill="hsl(var(--foreground) / 0.35)" />
        ))}
        {dots.map((arc, i) => {
          const a = project(arc.start.lng, arc.start.lat, w, h);
          const b = project(arc.end.lng, arc.end.lat, w, h);
          return (
            <g key={i}>
              <motion.path
                d={arcPath(a, b)}
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeWidth="1.4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.4 + i * 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
              {[a, b].map((p, j) => (
                <g key={j}>
                  <circle cx={p.x} cy={p.y} r="2.4" fill="hsl(var(--foreground))" />
                  <circle cx={p.x} cy={p.y} r="2.4" fill="hsl(var(--foreground))" opacity="0.4">
                    <animate attributeName="r" from="2" to="10" dur="2s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="2s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
