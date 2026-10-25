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
  'group flex h-16 flex-col items-center justify-center gap-1 rounded-container no-underline select-none text-2xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-background';
// The active cue is a pill behind the ICON only (not a paper slab over the
// whole slot): the slab read as a second button beside the contribute button.
const iconWrap =
  'relative flex h-8 w-14 items-center justify-center rounded-full transition-colors';

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
          // The dock is an INK island (spec panel 12), so both states are the
          // inverse of what they were on the old paper bar: active reverses to
          // PAPER, and the resting label is paper at 70% rather than
          // --muted-foreground.
          //
          // That inversion is the whole point. --muted-foreground is #545454,
          // designed against paper; on #111 it measures 2.49:1 and axe failed
          // it 42 times across the route sweep. Paper at 70% composites to
          // rgb(180,180,177) on ink — 9.1:1, which a 10px bold label needs
          // (bold only counts as large text from 18.66px up, so the bar here
          // is 4.5:1, not 3:1).
          active
            ? 'font-bold text-background'
            : 'font-medium text-background/70 hover:text-background',
        )}
      >
        <span
          className={cn(
            iconWrap,
            active ? 'bg-background text-foreground' : 'group-hover:bg-background/10',
          )}
        >
          {/* CSS scale-in replaces the framer layoutId shared-layout slide:
              the pill sits inside a non-uniform flex row (contribute button,
              accessory), so a single translated pill would need JS measurement
              — not worth ~97 KB of framer on the entry chunk. */}
          {active && !reduced && (
            <span aria-hidden className="absolute inset-0 scale-in rounded-full bg-background" />
          )}
          {avatar ? (
            <Avatar
              className={cn(
                'relative h-6 w-6 ring-1',
                active ? 'ring-foreground' : 'ring-background/40',
              )}
            >
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
        {/* `w-full truncate`: the slot is a fixed `h-14` with an `h-8` icon
            wrap above, so a label that wraps to two lines needs 32+4+28 = 64px
            of content in a 56px box and spills out of the dock. At 320px each
            of the five slots is only ~58px wide, and `fr` "Parcourir" and `ko`
            "둘러보기" both reach that. Truncating keeps the box; the full
            string stays available as the link's accessible name. */}
        <span className="w-full truncate px-0.5 text-center">{label}</span>
      </LocalizedLink>
      {/* The accessory is a SIBLING of the link, not a child — it is
          `pointer-events-none` decoration (the chevron hint) and must not
          become part of the link's accessible name. Anything inside it that
          carries meaning has to say so itself; NavBadge's `sr-only` label is
          what makes the trip-count dot reach AT from out here, where an
          `aria-label` on a roleless span did not. */}
      {accessory}
    </li>
  );
}
