import type { ProfileLens } from '@/lib/profileLens';
import { cn } from '@/lib/utils';

const LENSES: Array<{ value: ProfileLens; label: string }> = [
  { value: 'you', label: 'You' },
  { value: 'community', label: 'Community' },
  { value: 'public', label: 'Public' },
];

interface ViewAsToggleProps {
  lens: ProfileLens;
  onChange: (lens: ProfileLens) => void;
  className?: string;
}

/**
 * Three-segment lens preview on the own profile: re-renders the page exactly
 * as a community member or signed-out visitor would see it.
 */
export function ViewAsToggle({ lens, onChange, className }: ViewAsToggleProps) {
  return (
    <div
      role="group"
      aria-label="View profile as"
      className={cn('inline-flex items-center gap-0.5 rounded-badge bg-muted p-0.5', className)}
    >
      <span className="hidden px-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground sm:inline">
        View as
      </span>
      {LENSES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={lens === value}
          onClick={() => onChange(value)}
          className={cn(
            'min-h-8 rounded-badge px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            lens === value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
