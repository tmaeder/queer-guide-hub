import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogOut, Plane, Shield, UserRound, Users } from '@/components/icons';
import {
  BottomNavSheet,
  NAV_SHEET_HEADING,
  NavSheetTile,
} from '@/components/layout/bottom-nav/BottomNavSheet';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { IdentityRow } from '@/components/layout/IdentityRow';
import { FriendsOnlineCount } from '@/components/layout/FriendsOnlineCount';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { Button } from '@/components/ui/button';
import {
  DESTINATIONS,
  NAV_CLUSTERS,
  LEGAL_ITEMS,
  INTENT_NAV,
  INTENT_TRACK,
  isIntentActive,
} from '@/config/navigation';
import { TRACK_BG, TRACK_TEXT } from '@/components/transit/routeBulletMap';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useFriendsOnlineCount } from '@/hooks/useFriendIds';
import { generateAvatarUrl } from '@/lib/avatar';
import { cn } from '@/lib/utils';

const ACCOUNT_ROW =
  'flex min-h-12 items-center gap-2 px-4 py-2 text-15 font-medium no-underline hover:bg-foreground/5';

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tap-opened: focus the sheet itself rather than ringing its first control. */
  openedByPointer?: boolean;
}

/**
 * Bottom discovery sheet behind the mobile nav's "Explore" tab. Renders the
 * full destination hub (single-sourced from config/navigation.ts, so it never
 * drifts from the desktop header), account rows, and the language/currency/
 * theme controls that otherwise only live in the desktop footer.
 */
export function MobileNavSheet({ open, onOpenChange, openedByPointer }: MobileNavSheetProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin, isModerator } = useAdminRoles();
  const friendsOnline = useFriendsOnlineCount(user?.id);
  const tripCount = useInboxBadge();
  const [authOpen, setAuthOpen] = useState(false);
  const { pathname } = useLocation();
  // Same locale strip the footer uses, so "am I on this route" is answered the
  // same way on both surfaces.
  const localePath = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/');
  const isHere = (to: string) => localePath === to;

  const close = () => onOpenChange(false);

  const displayName = (profile?.display_name as string | null) || null;
  const username = (profile?.username as string | null) || null;
  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);
  const avatarInitial = (displayName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <>
      <BottomNavSheet
        open={open}
        onOpenChange={onOpenChange}
        openedByPointer={openedByPointer}
        title={t('header.mobileNav.menuTitle', 'Explore Queer Guide')}
        description={t(
          'header.mobileNav.menuDescription',
          'Jump to any section, switch language or theme.',
        )}
      >
        <div className="flex flex-col gap-6">
          {/* Intents first — the job you came to do. Compact rows, icon beside
              the label; the subtitle moves to the tooltip. */}
          <section className="flex flex-col gap-2">
            <h3 className={NAV_SHEET_HEADING}>
              {t('header.intents.sheetHeading', 'What are you here for?')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {INTENT_NAV.map((intent) => {
                const Icon = intent.icon;
                const active = isIntentActive(intent, localePath);
                const track = INTENT_TRACK[intent.id] ?? 'pink';
                return (
                  <LocalizedLink
                    key={intent.to}
                    to={intent.to}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    title={t(intent.subtitleKey, intent.subtitleFallback)}
                    className={cn(
                      'group flex min-h-14 items-center gap-2 rounded-element px-2 py-2 no-underline transition-colors',
                      active
                        ? 'bg-foreground text-background'
                        : 'bg-muted hover:bg-foreground hover:text-background',
                    )}
                  >
                    {/* Track disc: ink ring gates the fill (WCAG 1.4.11), ink
                        glyph on every fill, per routeBulletMap. */}
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full border-2 border-track-ring',
                        TRACK_BG[track],
                        TRACK_TEXT[track],
                      )}
                    >
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 truncate text-15 font-bold leading-tight">
                      {t(intent.labelKey, intent.fallback)}
                    </span>
                  </LocalizedLink>
                );
              })}
            </div>
          </section>

          {/* Every destination stays reachable — the intents are additive,
              never a replacement. Single-sourced from config/navigation.ts. */}
          <section className="flex flex-col gap-4">
            <h3 className={NAV_SHEET_HEADING}>
              {t('header.intents.browseHeading', 'Browse everything')}
            </h3>
            {NAV_CLUSTERS.map((cluster) => {
              const items = DESTINATIONS.filter((d) => d.cluster === cluster.id);
              if (!items.length) return null;
              return (
                <div key={cluster.id} className="flex flex-col gap-2">
                  {/* `h4`: a cluster is a subsection of "Browse everything". */}
                  <h4 className="text-13 font-bold">{t(cluster.labelKey)}</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((dest) => (
                      <NavSheetTile
                        key={dest.to}
                        to={dest.to}
                        icon={dest.icon}
                        label={t(dest.labelKey)}
                        active={isHere(dest.to)}
                        onClick={close}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Account: one grouped list instead of loose rows scattered
              through the sheet. */}
          <section className="flex flex-col gap-2">
            <h3 className={NAV_SHEET_HEADING}>{t('header.userMenu.you', 'You')}</h3>
            {user ? (
              <div className="flex flex-col divide-y divide-border-hairline overflow-hidden rounded-element bg-muted">
                <div className="flex items-center gap-2 pe-2">
                  <LocalizedLink
                    to="/hub"
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
                    to={`/user/${user.id}`}
                    onClick={close}
                    aria-label={t('header.userMenu.viewProfile', 'View public profile')}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-element text-muted-foreground no-underline hover:bg-foreground hover:text-background"
                  >
                    <UserRound size={18} />
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
            ) : (
              <Button
                variant="accent"
                onClick={() => {
                  close();
                  setAuthOpen(true);
                }}
                className="w-full"
              >
                {t('header.signIn', 'Sign in')}
              </Button>
            )}
          </section>

          {/* Display settings and the small print, in one quiet footer. */}
          <section className="flex flex-col gap-4 border-t border-border-hairline pt-4">
            <h3 className="sr-only">{t('header.mobileNav.settingsSection', 'Display')}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <LanguageSwitcher />
              <CurrencySelector />
              <ThemeToggle />
            </div>
            <nav
              aria-label={t('footer.legalNav', 'About and legal')}
              className="flex flex-wrap gap-x-4 gap-y-1"
            >
              {LEGAL_ITEMS.map((item) => (
                <LocalizedLink
                  key={item.to}
                  to={item.to}
                  onClick={close}
                  aria-current={isHere(item.to) ? 'page' : undefined}
                  className="inline-flex min-h-11 items-center text-13 text-muted-foreground no-underline hover:text-foreground hover:underline"
                >
                  {t(item.labelKey)}
                </LocalizedLink>
              ))}
            </nav>
          </section>
        </div>
      </BottomNavSheet>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
