import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { NavBadge } from './NavBadge';
import type { LongPressHandlers } from '@/hooks/useLongPress';
import { duration } from '@/lib/animation';
import { cn } from '@/lib/utils';

interface NavTabProps {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  /** prefers-reduced-motion → static pill (no shared-layout animation). */
  reduced: boolean;
  /** Haptic / analytics nudge on tap. */
  onTap: () => void;
  /**
   * When set, the tab is auth-gated and the user is anonymous: the tap is
   * intercepted (navigation prevented) and this runs instead.
   */
  onGate?: () => void;
  badgeCount?: number;
  badgeLabel?: string;
  /** When signed in and this is the identity tab, render the avatar. */
  avatar?: { src?: string; initial: string } | null;
  /** Long-press handlers (Explore → open the hub). Spread onto the link. */
  longPress?: LongPressHandlers;
  /** Secondary affordance rendered inside the slot (e.g. the hub chevron). */
  accessory?: ReactNode;
}

// `no-underline` is load-bearing, not cosmetic: the global inline-link rule
// (`li a:not(.no-underline)` in index.css) forces `display:inline`, which would
// override the `flex` utility and left-align the icon under the centred label.
const linkBase =
  'flex h-14 flex-col items-center justify-center gap-0.5 no-underline select-none text-2xs transition-colors rounded-element focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const iconWrap = 'relative flex h-8 w-12 items-center justify-center rounded-element';

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
  onGate,
  badgeCount,
  badgeLabel,
  avatar,
  longPress,
  accessory,
}: NavTabProps) {
  const Pill = reduced ? 'span' : motion.span;

  return (
    <li className="relative flex-1">
      <LocalizedLink
        to={to}
        aria-current={active ? 'page' : undefined}
        {...longPress}
        onClick={(e) => {
          onTap();
          if (onGate) {
            e.preventDefault();
            onGate();
          }
        }}
        className={cn(
          linkBase,
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className={iconWrap}>
          {active && (
            <Pill
              aria-hidden
              {...(reduced
                ? {}
                : {
                    layoutId: 'mobilenav-active-pill',
                    transition: { duration: duration.fast, ease: [0.22, 1, 0.36, 1] },
                  })}
              className="absolute inset-0 rounded-element bg-muted"
            />
          )}
          {avatar ? (
            <Avatar className="relative h-6 w-6">
              <AvatarImage src={avatar.src} alt="" />
              <AvatarFallback className="text-2xs">{avatar.initial}</AvatarFallback>
            </Avatar>
          ) : (
            <Icon className={cn('relative h-5 w-5', active && 'stroke-[2.25]')} aria-hidden />
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
