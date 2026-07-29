import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AdminStatTileProps {
  /** Big figure. */
  value: ReactNode;
  /** Caption under the figure. */
  label: string;
  /** Optional glyph beside the figure. */
  icon?: ComponentType<{ className?: string }>;
  /** Extra classes for the icon — callers pass a functional colour here. */
  iconClassName?: string;
  /** Turns the figure destructive. For counts that should be zero. */
  alert?: boolean;
  className?: string;
}

/**
 * Bordered stat tile for admin dashboards.
 *
 * Three private copies of this existed — pipeline-builder's OverviewTab and
 * MonitorTab (near-identical, differing only in an `alert` prop and the label
 * size) and design's DesignAuditTab (a Card variant with no icon). All three
 * are now this one component; the icon is optional, which is what let the
 * Card variant fold in.
 *
 * Both pipeline copies rendered the figure at `text-2xl font-bold` — an
 * arbitrary size outside the type scale. This uses `text-headline`.
 *
 * Distinct from `AdminStat`, which is a compact inline CHIP for the quality
 * panels (figure and label on one line). This is a block tile for a stat grid.
 */
export function AdminStatTile({
  value,
  label,
  icon: Icon,
  iconClassName,
  alert,
  className,
}: AdminStatTileProps) {
  return (
    <div
      className={cn('rounded-element border border-border bg-background p-4', className)}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className={cn('h-4 w-4', iconClassName)} />}
        <span
          className={cn('text-headline font-bold tabular-nums', alert && 'text-destructive')}
        >
          {value}
        </span>
      </div>
      <p className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
