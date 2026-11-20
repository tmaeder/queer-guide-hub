import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogOut, Plane, Settings, Shield, Users } from '@/components/icons';
import { BottomNavSheet } from '@/components/layout/bottom-nav/BottomNavSheet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { IdentityRow } from '@/components/layout/IdentityRow';
import { FriendsOnlineCount } from '@/components/layout/FriendsOnlineCount';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useFriendsOnlineCount } from '@/hooks/useFriendIds';
import { cn } from '@/lib/utils';

const ACCOUNT_ROW =
  'flex min-h-12 items-center gap-2 px-4 py-2 text-15 font-medium no-underline hover:bg-foreground/5';

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

  return (
    <BottomNavSheet
      open={open}
      onOpenChange={onOpenChange}
      openedByPointer={openedByPointer}
      onDismissFocus={onDismissFocus}
      title={t('header.userMenu.you', 'You')}
    >
      <div className="flex flex-col divide-y divide-border-hairline overflow-hidden rounded-element bg-muted">
        <div className="flex items-center gap-2 pe-2">
          <LocalizedLink
            to={`/user/${user.id}`}
            onClick={close}
            className="flex min-w-0 flex-1 items-center gap-2 p-4 no-underline hover:bg-foreground/5"
          >
            <IdentityRow
              avatarSrc={avatarSrc}
              avatarInitial={avatarInitial}
              username={username}
              email={user.email ?? null}
              fallbackLabel={t('header.userMenu.you', 'You')}
              avatarPx={40}
            />
          </LocalizedLink>
          <LocalizedLink
            to="/settings"
            onClick={close}
            aria-label={t('settings.title', 'Settings')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-element text-muted-foreground no-underline hover:bg-foreground hover:text-background"
          >
            <Settings size={18} />
          </LocalizedLink>
        </div>
        <LocalizedLink
          to="/hub/plans"
          onClick={close}
          aria-current={isHere('/hub/plans') ? 'page' : undefined}
          className={ACCOUNT_ROW}
        >
          <Plane size={18} className="text-muted-foreground" />
          <span>{t('header.mobileNav.trips', 'My Trips')}</span>
          <NavBadge
            inline
            count={tripCount}
            label={t('header.mobileNav.tripsBadge', '{{count}} trip items need attention', {
              count: tripCount,
            })}
          />
        </LocalizedLink>
        <LocalizedLink
          to="/hub/friends"
          onClick={close}
          aria-current={isHere('/hub/friends') ? 'page' : undefined}
          className={ACCOUNT_ROW}
        >
          <Users size={18} className="text-muted-foreground" />
          <span>{t('header.userMenu.friends', 'Friends')}</span>
          <FriendsOnlineCount count={friendsOnline} />
        </LocalizedLink>
        {(isAdmin || isModerator) && (
          <LocalizedLink to="/admin" onClick={close} className={ACCOUNT_ROW}>
            <Shield size={18} className="text-muted-foreground" />
            <span>{t('header.adminConsole', 'Admin Console')}</span>
          </LocalizedLink>
        )}
        <button
          type="button"
          onClick={() => {
            close();
            void signOut();
          }}
          className={cn(ACCOUNT_ROW, 'w-full text-left text-destructive')}
        >
          <LogOut size={18} />
          <span>{t('header.signOut', 'Sign Out')}</span>
        </button>
      </div>
    </BottomNavSheet>
  );
}
