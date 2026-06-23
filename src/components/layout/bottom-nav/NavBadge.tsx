interface NavBadgeProps {
  /** Numeric count → pill showing the value (capped at 99+). */
  count?: number;
  /** Render a small dot instead of a count (presence signal, no number). */
  dot?: boolean;
  /** Localized screen-reader label. Omit on a purely decorative dot. */
  label?: string;
}

/**
 * Absolute-positioned badge for the bottom-nav icons: a count pill or a small
 * dot. Anchored to the icon's top-end corner with a logical inset so it flips
 * correctly under RTL. The parent must be `relative`.
 */
export function NavBadge({ count, dot, label }: NavBadgeProps) {
  if (dot) {
    return (
      <span
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-brand"
      />
    );
  }

  if (!count || count <= 0) return null;

  return (
    <span
      aria-label={label}
      className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-brand px-1 text-2xs font-medium leading-none text-accent-brand-foreground"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
