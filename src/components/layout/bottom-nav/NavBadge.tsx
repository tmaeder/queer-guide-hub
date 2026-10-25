import { cn } from '@/lib/utils';

interface NavBadgeProps {
  /** Numeric count → pill showing the value (capped at 99+). */
  count?: number;
  /** Render a small dot instead of a count (presence signal, no number). */
  dot?: boolean;
  /** Localized screen-reader label. Omit on a purely decorative dot. */
  label?: string;
  /**
   * `true` renders the badge in the normal flow as a trailing mark on a row,
   * instead of pinned to an icon's corner.
   *
   * This exists so the mobile nav sheet stops carrying its own copy. It had a
   * local `CountBadge` that was this component with a different radius and a
   * different height — one count mark, two implementations, which is how the
   * two drifted apart in the first place.
   */
  inline?: boolean;
}

/**
 * The count mark used by the bottom-nav icons and the nav sheet's rows: a
 * count pill or a small presence dot.
 *
 * Positioned with LOGICAL insets (`-end-*`) so it flips under RTL. In the
 * pinned mode the parent must be `relative`.
 *
 * ## Why the label is an `sr-only` span and not just `aria-label`
 *
 * It used to be `<span aria-label={label}>` with the digits as the visible
 * text. `aria-label` on a generic with no role is dropped by the accname spec
 * and by every major AT — so on the dock, where the dot is additionally
 * rendered as a SIBLING of the link rather than inside it, the label was
 * computed, translated, and then reached nobody at all. Hiding the digits and
 * carrying the sentence in an `sr-only` span makes the name real wherever the
 * badge is mounted, which is the property the previous shape lacked.
 */
export function NavBadge({ count, dot, label, inline = false }: NavBadgeProps) {
  // Pinned marks carry an ink ring so they read as cut out of the dock.
  const place = inline ? 'ms-auto' : 'absolute -end-1 -top-1 ring-2 ring-foreground';

  if (dot) {
    return (
      <span className={cn(place, 'h-2 w-2 rounded-full bg-background')}>
        {label ? <span className="sr-only">{label}</span> : null}
      </span>
    );
  }

  if (!count || count <= 0) return null;

  return (
    <span
      className={cn(
        place,
        // `rounded-badge`, not `rounded-full`: the design rules put count marks
        // at the 9px badge rank, which is what NotificationBell already uses.
        // `rounded-full` stays correct for the true circles — the dot above,
        // and the presence dots in the header menu.
        'flex items-center justify-center rounded-badge px-1 text-2xs font-medium leading-none',
        inline
          ? 'h-5 min-w-5 bg-foreground text-background'
          : 'h-4 min-w-4 bg-background text-foreground',
      )}
    >
      <span aria-hidden>{count > 99 ? '99+' : count}</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
