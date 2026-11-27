import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ToggleChipProps {
  pressed: boolean;
  onPressedChange: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A compact multi-select chip: a real button with aria-pressed. `rounded-badge`
 * is load-bearing — it is the sanctioned exception to the 44px button floor in
 * index.css, so the chip can sit at 32px.
 */
export function ToggleChip({
  pressed,
  onPressedChange,
  icon,
  disabled,
  title,
  children,
  className,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onPressedChange}
      className={cn(
        'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-badge px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pressed
          ? 'bg-foreground text-background'
          : 'bg-muted text-foreground hover:bg-surface-container-high',
        disabled && 'opacity-40',
        className,
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
