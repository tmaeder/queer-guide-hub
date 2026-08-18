import type { ReactNode } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { NavBadge } from './NavBadge';
import type { LongPressHandlers } from '@/hooks/useLongPress';
import { cn } from '@/lib/utils';
import type { NavIcon } from '@/config/navigation';

interface NavTabProps {
  to: string;
  icon: NavIcon;
  label: string;
  active: boolean;
  /** prefers-reduced-motion → static pill (no scale-in animation). */
  reduced: boolean;
  /** Haptic / analytics nudge on tap. */
  onTap: () => void;
  /**
   * When set, the tap is intercepted (navigation prevented) and this runs
   * instead. Two callers: the anonymous auth gate, and Explore — which opens
   * the intent sheet rather than navigating to `/search`. `to` is still
   * required and still rendered, so the slot keeps a real href for
   * middle-click, "open in new tab" and crawlers.
   */
  onIntercept?: () => void;
  badgeCount?: number;
  badgeLabel?: string;
  /** When signed in and this is the identity tab, render the avatar. */
  avatar?: { src?: string; initial: string } | null;
  /** Long-press handlers (Explore → open the hub). Spread onto the link. */
  longPress?: LongPressHandlers;
  /** Secondary affordance rendered inside the slot (e.g. the trip-count dot). */
  accessory?: ReactNode;
  /** Set when onIntercept opens a dialog rather than navigating. */
  hasPopup?: boolean;
  /** Companion to hasPopup — the dialog's open state. */
  expanded?: boolean;
}

// `no-underline` is load-bearing, not cosmetic: the global inline-link rule
// (`li a:not(.no-underline)` in index.css) forces `display:inline`, which would
// override the `flex` utility and left-align the icon under the centred label.
const linkBase =
  'flex h-14 flex-col items-center justify-center gap-1 no-underline select-none text-2xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const iconWrap = 'relative flex h-8 w-12 items-center justify-center';

/**
 * One bottom-nav slot: a localized link with an active pill, icon (or avatar),
 * optional count badge, optional auth gate and optional long-press / accessory.
 * Active state is signalled with `aria-current="page"` (these are links, not a
 * tablist). The active treatment is the shared pill + accent text for every
 * slot — including the avatar — so it reads consistently.
 */
export function NavTab({
  to,
  icon: Icon,
  label,
  active,
  reduced,
  onTap,
  onIntercept,
  badgeCount,
  badgeLabel,
  avatar,
  longPress,
  accessory,
  hasPopup,
  expanded,
}: NavTabProps) {
  return (
    <li className="relative flex-1">
      <LocalizedLink
        to={to}
        aria-current={active ? 'page' : undefined}
        aria-haspopup={hasPopup ? 'dialog' : undefined}
        aria-expanded={hasPopup ? expanded : undefined}
        {...longPress}
        onClick={(e) => {
          onTap();
          if (onIntercept) {
            e.preventDefault();
            onIntercept();
          }
        }}
        className={cn(
          linkBase,
          // Active reverses to ink, the same move the desktop track tabs make.
          // The soft `bg-muted` pill it replaces was the last rounded, tinted
          // surface in the chrome and read as a different design system from
          // the bar it sat in.
          active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className={iconWrap}>
          {/* CSS scale-in replaces the framer layoutId shared-layout slide:
              the pill sits inside a non-uniform flex row (contribute button,
              accessory), so a single translated pill would need JS measurement
              — not worth ~97 KB of framer on the entry chunk. */}
          {active && !reduced && <span aria-hidden className="absolute inset-0 scale-in" />}
          {avatar ? (
            <Avatar className="relative h-6 w-6">
              <AvatarImage src={avatar.src} alt="" />
              <AvatarFallback className="text-2xs">{avatar.initial}</AvatarFallback>
            </Avatar>
          ) : (
            // No stroke-width bump on active. `stroke-[2.25]` is CSS, so it beats
            // the SVG attribute — sensible on lucide's 24-unit viewBox, but a
            // near-invisible hairline on a TransitIcon's 100-unit one. Active
            // already reads through two stronger, icon-system-agnostic cues:
            // text-foreground, and the bg-muted pill behind the glyph.
            <Icon className="relative h-5 w-5" aria-hidden />
          )}
          {badgeCount != null && badgeCount > 0 && (
            <NavBadge count={badgeCount} label={badgeLabel} />
          )}
        </span>
        <span>{label}</span>
      </LocalizedLink>
      {accessory}
    </li>
  );
}
