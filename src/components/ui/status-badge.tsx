import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Circle, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusBadgeStatus = 'idle' | 'success' | 'warning' | 'error' | 'info';

/**
 * Use `tone="destructive"` to lift error states into the --destructive
 * token (the only chromatic color allowed in the product, reserved for
 * irreversible / blocking errors — payment declined, pipeline failed,
 * destructive confirms). Default tone stays monochrome.
 */
export type StatusBadgeTone = 'mono' | 'destructive';

const ICONS: Record<StatusBadgeStatus, LucideIcon> = {
  idle: Circle,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

const OPACITY: Record<StatusBadgeStatus, string> = {
  idle: 'text-muted-foreground',
  success: 'text-foreground',
  warning: 'text-foreground',
  error: 'text-foreground',
  info: 'text-muted-foreground',
};

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeStatus;
  tone?: StatusBadgeTone;
  /** Optional label override. Default: capitalized status name. */
  label?: React.ReactNode;
  /** Render as a dot only (no label). Useful in dense tables. */
  dotOnly?: boolean;
  /** Suppress the icon (label-only). */
  noIcon?: boolean;
}

/**
 * Monochrome status indicator that replaces red/green/amber badge variants
 * in admin/cms. Conveys state via icon + label, not color. Hard errors may
 * opt into the --destructive token via `tone="destructive"`.
 *
 * Added 2026-05-19 (refactor/monochrome-2026 Phase 3a).
 */
export function StatusBadge({
  status,
  tone = 'mono',
  label,
  dotOnly = false,
  noIcon = false,
  className,
  ...rest
}: StatusBadgeProps) {
  const Icon = ICONS[status];
  const resolvedLabel = label ?? status.charAt(0).toUpperCase() + status.slice(1);
  const colorClass =
    tone === 'destructive' && (status === 'error' || status === 'warning')
      ? 'text-destructive'
      : OPACITY[status];

  if (dotOnly) {
    return (
      <span
        aria-label={typeof resolvedLabel === 'string' ? resolvedLabel : status}
        title={typeof resolvedLabel === 'string' ? resolvedLabel : status}
        className={cn('inline-flex items-center', colorClass, className)}
        {...rest}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-badge border border-border bg-background px-2 py-0.5 text-xs font-medium',
        colorClass,
        className,
      )}
      {...rest}
    >
      {!noIcon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{resolvedLabel}</span>
    </span>
  );
}
