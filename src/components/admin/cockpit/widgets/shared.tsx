/**
 * Shared presentational helpers for cockpit widget bodies.
 * Monochrome, token-only (no color literals — admin ESLint enforces this).
 */

import { Fragment, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Big headline number with a caption. */
export function BigStat({
  value,
  caption,
  alert,
}: {
  value: ReactNode;
  caption: string;
  alert?: boolean;
}) {
  return (
    <div>
      <div className={cn('text-display font-bold leading-none font-display', alert && 'text-destructive')}>
        {value}
      </div>
      <div className="mt-1 text-2xs font-medium uppercase tracking-label text-muted-foreground">
        {caption}
      </div>
    </div>
  );
}

/** A clickable row: label on the left, count badge on the right. */
export function StatRow({
  label,
  value,
  icon: Icon,
  onClick,
  alert,
}: {
  label: string;
  value: ReactNode;
  icon?: React.ElementType;
  onClick?: () => void;
  alert?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex items-center justify-between gap-2 px-2 py-1 text-left',
        onClick && 'hover:bg-muted/50',
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        {Icon && <Icon size={13} className="text-muted-foreground shrink-0" aria-hidden />}
        <span className="text-sm truncate">{label}</span>
      </span>
      <span className={cn('text-sm font-semibold tabular-nums', alert && 'text-destructive')}>
        {value}
      </span>
    </button>
  );
}

/** 2-up metric tiles on a hairline grid. */
export function MetricTiles({
  metrics,
}: {
  metrics: Array<{ label: string; value: ReactNode; alert?: boolean }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-px bg-border">
      {metrics.map((m) => (
        <div key={m.label} className="p-2 bg-muted">
          <div className="text-2xs font-medium uppercase tracking-label text-muted-foreground">
            {m.label}
          </div>
          <div className={cn('mt-1 text-base font-bold leading-none', m.alert && 'text-destructive')}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Footer "view all →" link styled as a quiet button. */
export function DrillButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {label}
      <ArrowRight size={12} aria-hidden />
    </button>
  );
}

export function WidgetLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Fragment key={i}>
          <Skeleton className="h-5 w-full rounded-element" />
        </Fragment>
      ))}
    </div>
  );
}
