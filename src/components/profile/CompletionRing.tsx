import { cn } from '@/lib/utils';

interface CompletionRingProps {
  /** 0..100 */
  percent: number;
  size?: number;
  strokeWidth?: number;
  label?: React.ReactNode;
  className?: string;
}

/**
 * SVG circular progress ring for profile completion. Monochrome — the track is
 * border, the fill is foreground. No gradient, no animation other than width
 * transition (respects prefers-reduced-motion via CSS).
 */
export function CompletionRing({
  percent,
  size = 64,
  strokeWidth = 4,
  label,
  className,
}: CompletionRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="img"
      aria-label={`Profile ${pct}% complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-border"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-foreground transition-[stroke-dasharray] duration-500"
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-foreground text-13 tabular-nums"
        >
          {pct}%
        </text>
      </svg>
      {label && <div className="text-sm text-muted-foreground">{label}</div>}
    </div>
  );
}
