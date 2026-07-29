import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Segmented toggle group.
 *
 * shadcn's toggle-group is not installed in this repo, and every existing view
 * switcher (SearchResults, EventsResultBar, MarketplaceControlBar) hand-rolls
 * the same button pair. This is that pattern extracted rather than a fourth copy.
 *
 * Uses a radiogroup rather than a tablist: these select a value, they do not
 * reveal separately-labelled tab panels.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex items-center gap-1 border border-border rounded-element p-1', className)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            variant={selected ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onChange(option.value)}
            // Icon-only on small screens; the label is always the accessible name.
            aria-label={option.label}
            className="gap-2"
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
