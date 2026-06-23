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
      className={cn(
        'inline-flex items-center rounded-element border border-border bg-card p-0.5',
        className,
      )}
    >
      <span className="px-2 text-2xs uppercase tracking-wider text-muted-foreground">
        View as
      </span>
      {LENSES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={lens === value}
          onClick={() => onChange(value)}
          className={
            'rounded-badge px-2 py-1 text-13 transition-colors ' +
            (lens === value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
