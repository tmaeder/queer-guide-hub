import type { TripWithDetails } from '@/hooks/useTrips';
import { computeTripProgress } from './tripProgress';

interface Props {
  trip: TripWithDetails;
  size?: number;
}

/**
 * SVG progress ring for the planner header. Solid-color only (per design
 * system rule — no gradients with alpha).
 */
export function TripProgressRing({ trip, size = 72 }: Props) {
  const brand = 'hsl(var(--brand))';
  const divider = 'hsl(var(--border))';
  const { percent } = computeTripProgress(trip);

  const strokeWidth = Math.max(4, Math.round(size / 12));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Trip planning ${percent}% complete`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={divider}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={brand}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <span
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 700,
            fontSize: size / 4,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {percent}
        </span>
        <span
          className="text-muted-foreground"
          style={{
            fontSize: size / 8,
            lineHeight: 1,
            marginTop: 1,
          }}
        >
          %
        </span>
      </div>
    </div>
  );
}
