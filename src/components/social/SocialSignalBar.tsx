import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SocialSignal {
  /** Lucide-react icon component. */
  icon: LucideIcon;
  /** Numeric value driving the label; signals with value <= 0 are dropped. */
  count: number;
  /** Optional override text; default builds from count + label. */
  text?: string;
  /** Label shown after the count, e.g. "friends saved", "going". */
  label?: string;
  /** Optional tooltip. */
  title?: string;
}

interface SocialSignalBarProps {
  signals: SocialSignal[];
  className?: string;
  /** Render as a single dotted line ("3 friends · 12 trips") instead of chips. */
  inline?: boolean;
}

/**
 * Compact strip of social-proof badges shown on entity cards (venues, events,
 * listings, trips). Monochrome — uses lucide icons + border, no chromatic color.
 * Drops zero-count signals; renders nothing if none remain.
 */
export function SocialSignalBar({ signals, className, inline = false }: SocialSignalBarProps) {
  const visible = signals.filter((s) => s.count > 0);
  if (visible.length === 0) return null;

  if (inline) {
    return (
      <p className={cn('text-13 text-muted-foreground', className)}>
        {visible
          .map((s) => s.text ?? `${s.count} ${s.label ?? ''}`.trim())
          .join(' · ')}
      </p>
    );
  }

  return (
    <ul
      className={cn('flex flex-wrap items-center gap-2', className)}
      aria-label="Community signals"
    >
      {visible.map((s, i) => {
        const Icon = s.icon;
        return (
          <li
            key={i}
            className="inline-flex items-center gap-1.5 rounded-badge border border-border px-2 py-0.5 text-13 text-foreground"
            title={s.title}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="tabular-nums">{s.count}</span>
            {s.label && <span className="text-muted-foreground">{s.label}</span>}
          </li>
        );
      })}
    </ul>
  );
}

