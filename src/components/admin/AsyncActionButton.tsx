/**
 * AsyncActionButton — a button that owns the full lifecycle of a one-click
 * async admin action: pending/disabled state, an optional progress bar, and a
 * "still working…" hint for long-running ops (geocoding, LLM backfills,
 * imports). Built on useAsyncAction, so retry + error toasting come for free.
 *
 * Indeterminate by default (just the button spinner + timeout hint). Pass
 * `progress` (0–100) when a real percentage is available (e.g. an import job's
 * progress_percentage) to show a determinate bar.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { cn } from '@/lib/utils';

export interface AsyncActionButtonProps
  extends Omit<ButtonProps, 'onClick' | 'loading'> {
  action: () => Promise<unknown>;
  /** Replacement label while the action runs. Defaults to children. */
  pendingLabel?: ReactNode;
  /** ms before the "still working" hint appears. Default 8000; 0 disables. */
  timeoutMs?: number;
  /** Hint text shown once timeoutMs elapses while still pending. */
  timeoutHint?: string;
  /** 0–100 determinate progress. Omit for indeterminate (no bar). */
  progress?: number;
  successMessage?: string;
  errorMessage?: string;
  /** If set, window.confirm(confirm) must pass before the action runs. */
  confirm?: string;
  onDone?: () => void;
}

export function AsyncActionButton({
  action,
  children,
  pendingLabel,
  timeoutMs = 8000,
  timeoutHint = 'Still working… this can take a while.',
  progress,
  successMessage,
  errorMessage,
  confirm,
  onDone,
  className,
  disabled,
  ...buttonProps
}: AsyncActionButtonProps) {
  const [showHint, setShowHint] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { run, isPending } = useAsyncAction(action, {
    successMessage,
    errorMessage,
    onSuccess: () => onDone?.(),
  });

  // Only the timer callback (async) flips the hint on; render gates it behind
  // isPending so it disappears the moment the action settles — no synchronous
  // setState in the effect body.
  useEffect(() => {
    if (!isPending || timeoutMs <= 0) return;
    timerRef.current = setTimeout(() => setShowHint(true), timeoutMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPending, timeoutMs]);

  const handleClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    setShowHint(false);
    run();
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <Button
        {...buttonProps}
        className={className}
        loading={isPending}
        disabled={disabled || isPending}
        onClick={handleClick}
      >
        {isPending && pendingLabel ? pendingLabel : children}
      </Button>
      {isPending && typeof progress === 'number' && (
        <Progress value={progress} className="h-1" />
      )}
      {isPending && showHint && (
        <p className={cn('text-2xs text-muted-foreground')}>{timeoutHint}</p>
      )}
    </div>
  );
}
