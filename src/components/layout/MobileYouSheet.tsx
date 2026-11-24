import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ComponentType, ReactNode } from 'react';
import { ChevronRight, LogOut, Pencil, Plane, Settings, Shield } from '@/components/icons';
import { BottomNavSheet } from '@/components/layout/bottom-nav/BottomNavSheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { cn } from '@/lib/utils';

/** Icon disc · label · one-line context · chevron — same anatomy as the Hub menu rows. */
function Row({
  to,
  icon: Icon,
  label,
  hint,
  active,
  badge,
  onClick,
}: {
  to: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  label: string;
  hint?: string;
  active?: boolean;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <LocalizedLink
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-14 items-center gap-4 px-4 py-2 no-underline transition-colors',
        active ? 'bg-foreground text-background' : 'hover:bg-foreground/5',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-foreground">
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-15 font-bold">{label}</span>
        {hint && (
          <span
            className={cn(
              'block truncate text-xs',
              active ? 'text-background/70' : 'text-muted-foreground',
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {badge}
      <ChevronRight size={16} aria-hidden className="shrink-0 opacity-60" />
    </LocalizedLink>
  );
}

interface MobileYouSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openedByPointer?: boolean;
  onDismissFocus?: () => void;
}

/** The dock's "You" tab: your profile, trips, settings and sign-out. Friends is a Hub tab. */
export function MobileYouSheet({
  open,
  onOpenChange,
  openedByPointer,
  onDismissFocus,
}: MobileYouSheetProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin, isModerator } = useAdminRoles();
  const tripCount = useInboxBadge();
  const { pathname } = useLocation();
  const localePath = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
  const isHere = (to: string) => localePath === to;
  const close = () => onOpenChange(false);

  if (!user) return null;
  const displayName = (profile?.display_name as string | null) || null;
  const username = (profile?.username as string | null) || null;
  const avatarSrc = (profile?.avatar_url as string | null | undefined) || undefined;
  const avatarInitial = (displayName || user.email || 'U').charAt(0).toUpperCase();

  const name = displayName || (username ? `@${username}` : t('header.userMenu.you', 'You'));

  return (
    <BottomNavSheet
      open={open}
      onOpenChange={onOpenChange}
      openedByPointer={openedByPointer}
      onDismissFocus={onDismissFocus}
      hideTitle
      title={t('header.userMenu.you', 'You')}
    >
      <div className="flex flex-col gap-4">
        {/* Who you are: the whole card opens your profile. */}
        <LocalizedLink
          to={`/user/${user.id}`}
          onClick={close}
          className="group flex items-center gap-4 rounded-container bg-muted p-4 no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          <Avatar className="h-16 w-16 shrink-0 ring-4 ring-card">
            <AvatarImage src={avatarSrc} alt="" />
            <AvatarFallback className="text-title font-bold">{avatarInitial}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-title font-bold leading-tight">{name}</span>
            {displayName && username && displayName !== username && (
              <span className="truncate text-sm text-muted-foreground group-hover:text-background/70">
                @{username}
              </span>
            )}
            <span className="text-xs font-bold text-muted-foreground group-hover:text-background/70">
              {t('header.userMenu.viewProfile', 'View public profile')}
            </span>
          </span>
          <ChevronRight size={18} aria-hidden className="shrink-0 opacity-60" />
        </LocalizedLink>

        <nav
          aria-label={t('header.userMenu.yourAccount', 'Your account')}
          className="flex flex-col divide-y divide-border overflow-hidden rounded-container bg-muted"
        >
          <Row
            to="/settings/profile"
            icon={Pencil}
            label={t('header.userMenu.editProfile', 'Edit profile')}
            hint={t('header.userMenu.editProfileHint', 'Photo, name, pronouns, bio')}
            active={isHere('/settings/profile')}
            onClick={close}
          />
          <Row
            to="/hub/plans"
            icon={Plane}
            label={t('header.mobileNav.trips', 'My Trips')}
            hint={t('header.userMenu.tripsHint', 'Plans, bookings and saved trips')}
            active={isHere('/hub/plans')}
            onClick={close}
            badge={
              tripCount > 0 ? (
                <NavBadge
                  inline
                  count={tripCount}
                  label={t('header.mobileNav.tripsBadge', '{{count}} trip items need attention', {
                    count: tripCount,
                  })}
                />
              ) : undefined
            }
          />
          <Row
            to="/settings"
            icon={Settings}
            label={t('settings.title', 'Settings')}
            hint={t('header.userMenu.settingsHint', 'Privacy, notifications, account')}
            active={
              localePath === '/settings' ||
              (localePath.startsWith('/settings/') && !isHere('/settings/profile'))
            }
            onClick={close}
          />
          {(isAdmin || isModerator) && (
            <Row
              to="/admin"
              icon={Shield}
              label={t('header.mobileNav.admin', 'Admin')}
              onClick={close}
            />
          )}
        </nav>

        <button
          type="button"
          onClick={() => {
            close();
            void signOut();
          }}
          className="flex min-h-11 items-center gap-4 rounded-container px-4 text-15 font-bold text-destructive transition-colors hover:bg-destructive/10"
        >
          <span className="flex size-9 shrink-0 items-center justify-center">
            <LogOut size={18} aria-hidden />
          </span>
          {t('header.signOut', 'Sign Out')}
        </button>
      </div>
    </BottomNavSheet>
  );
}
