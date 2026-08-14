import { cn } from '@/lib/utils';

/**
 * The design system's fourth button treatment — "chip (smaller, same border)"
 * — which the foundation spec lists but nothing ever built, so every filter
 * surface in the app hand-rolls its own.
 *
 * A chip FILLS on hover; it never lifts. The hard rule is that a surface fills
 * ink or casts the hard shadow, never both, and a chip is too small to carry a
 * 6px offset shadow legibly.
 */
export function FilterChip({
  active,
  label,
  onClick,
  className,
}: {
  active: boolean;
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 border-2 border-foreground px-2.5 text-13 font-bold',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-foreground text-background'
          : 'bg-background text-foreground hover:bg-foreground hover:text-background',
        className,
      )}
    >
      {label}
    </button>
  );
}
