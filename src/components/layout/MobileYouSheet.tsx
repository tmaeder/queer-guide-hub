import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogOut, Plane, Settings, Shield, Users } from '@/components/icons';
import { BottomNavSheet, NavSheetTile } from '@/components/layout/bottom-nav/BottomNavSheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useFriendsOnlineCount } from '@/hooks/useFriendIds';
import { cn } from '@/lib/utils';

interface MobileYouSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openedByPointer?: boolean;
  onDismissFocus?: () => void;
}

/** The dock's "You" tab: your profile, trips, friends, settings and sign-out. */
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
  const friendsOnline = useFriendsOnlineCount(user?.id);
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
  const showFriends = friendsOnline !== null && friendsOnline > 0;

  return (
    <BottomNavSheet
      open={open}
      onOpenChange={onOpenChange}
      openedByPointer={openedByPointer}
      onDismissFocus={onDismissFocus}
      hideTitle
      title={t('header.userMenu.you', 'You')}
    >
      {/* mt clears the sheet's close button, now that there is no title row. */}
      <div className="mt-8 flex flex-col gap-4">
        {/* Who you are: the whole card opens your profile. */}
        <LocalizedLink
          to={`/user/${user.id}`}
          onClick={close}
          className="group flex items-center gap-4 rounded-container bg-muted p-4 no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          <Avatar className="h-14 w-14 shrink-0 ring-4 ring-card">
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
          </span>
        </LocalizedLink>

        <nav
          aria-label={t('header.userMenu.yourAccount', 'Your account')}
          className={cn('grid gap-1.5', isAdmin || isModerator ? 'grid-cols-4' : 'grid-cols-3')}
        >
          <NavSheetTile
            to="/hub/plans"
            icon={Plane}
            label={t('header.mobileNav.trips', 'My Trips')}
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
          <NavSheetTile
            to="/hub/friends"
            icon={Users}
            label={t('header.userMenu.friends', 'Friends')}
            active={isHere('/hub/friends')}
            onClick={close}
            badge={
              showFriends ? (
                <span className="flex h-5 min-w-5 items-center justify-center gap-1 rounded-full bg-track-green px-1.5 text-2xs font-bold tabular-nums text-track-ring">
                  <span aria-hidden>{friendsOnline}</span>
                  <span className="sr-only">
                    {t('header.userMenu.friendsOnline', '{{count}} online', {
                      count: friendsOnline,
                    })}
                  </span>
                </span>
              ) : undefined
            }
          />
          <NavSheetTile
            to="/settings"
            icon={Settings}
            label={t('settings.title', 'Settings')}
            active={localePath.startsWith('/settings')}
            onClick={close}
          />
          {(isAdmin || isModerator) && (
            <NavSheetTile
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
          className="flex min-h-11 items-center justify-center gap-2 rounded-element text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut size={16} aria-hidden />
          {t('header.signOut', 'Sign Out')}
        </button>
      </div>
    </BottomNavSheet>
  );
}
