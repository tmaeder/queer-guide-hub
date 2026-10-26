import { useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LogOut, Plane, Shield, UserRound, Users } from '@/components/icons';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
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
import { TrackSwatch } from '@/components/transit/TrackSwatch';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useFriendsOnlineCount } from '@/hooks/useFriendIds';
import { generateAvatarUrl } from '@/lib/avatar';
import { cn } from '@/lib/utils';

interface MobileNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Bottom discovery sheet behind the mobile nav's "Explore" tab. Renders the
 * full destination hub (single-sourced from config/navigation.ts, so it never
 * drifts from the desktop header), account rows, and the language/currency/
 * theme controls that otherwise only live in the desktop footer.
 */
export function MobileNavSheet({ open, onOpenChange }: MobileNavSheetProps) {
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          // `dvh`, not `vh`: `vh` is the LARGE-viewport unit, so under a
          // dynamic mobile toolbar an 85vh sheet overshoots the space it
          // actually has.
          className="max-h-[85dvh] p-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* No `overflow-y-auto` here. SheetContent already scrolls and owns
              the height cap, and this inner box has no cap of its own — so the
              second scroll container could never scroll and was dead weight
              that only made the scroll owner ambiguous. */}
          <div className="flex flex-col gap-6 px-6 pb-6 pt-6">
            <SheetHeader className="pr-8">
              <SheetTitle className="font-display">
                {t('header.mobileNav.menuTitle', 'Explore Queer Guide')}
              </SheetTitle>
              <SheetDescription>
                {t(
                  'header.mobileNav.menuDescription',
                  'Jump to any section, switch language or theme.',
                )}
              </SheetDescription>
            </SheetHeader>

            {/* Identity / account */}
            {user ? (
              <div className="flex items-center gap-4">
                <LocalizedLink
                  to="/hub"
                  onClick={close}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-element p-2 no-underline hover:bg-muted"
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
                  className="flex h-11 w-11 items-center justify-center rounded-element text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                >
                  <UserRound size={18} />
                </LocalizedLink>
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

            {/* Personal shortcut: Trips with orphan badge */}
            {user && (
              <LocalizedLink
                to="/hub/plans"
                onClick={close}
                aria-current={isHere('/hub/plans') ? 'page' : undefined}
                className="flex items-center gap-2 rounded-element p-4 no-underline hover:bg-muted"
              >
                <Plane size={18} className="text-muted-foreground" />
                <span className="text-15 font-medium">
                  {t('header.mobileNav.trips', 'My Trips')}
                </span>
                {/* The label was an English template literal where the dock's
                    identical badge is translated — same string, one locale. */}
                <NavBadge
                  inline
                  count={tripCount}
                  label={t('header.mobileNav.tripsBadge', '{{count}} trip items need attention', {
                    count: tripCount,
                  })}
                />
              </LocalizedLink>
            )}

            {/* Friends, with how many are online now (mirrors the header menu) */}
            {user && (
              <LocalizedLink
                to="/hub/friends"
                onClick={close}
                aria-current={isHere('/hub/friends') ? 'page' : undefined}
                className="flex items-center gap-2 rounded-element p-4 no-underline hover:bg-muted"
              >
                <Users size={18} className="text-muted-foreground" />
                <span className="text-15 font-medium">
                  {t('header.userMenu.friends', 'Friends')}
                </span>
                <FriendsOnlineCount count={friendsOnline} />
              </LocalizedLink>
            )}

            {/* Intents first — the job you came to do. Full-width rows with a
                subtitle, because unlike the icon grid below these are not
                self-explanatory nouns. */}
            <div className="flex flex-col gap-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('header.intents.sheetHeading', 'What are you here for?')}
              </h3>
              <div className="flex flex-col gap-2">
                {INTENT_NAV.map((intent) => {
                  const Icon = intent.icon;
                  const active = isIntentActive(intent, localePath);
                  return (
                    <LocalizedLink
                      key={intent.to}
                      to={intent.to}
                      onClick={close}
                      // `aria-current` was absent from every row in this sheet
                      // while the desktop nav, both footer variants and the
                      // dock all set it — so a reader on /venues who opened
                      // the sheet got no indication of where they already were.
                      aria-current={active ? 'page' : undefined}
                      // `group` so the subtitle below can follow the row's
                      // hover inversion. It cannot inherit `hover:text-*` —
                      // that sets the parent's own colour, and the subtitle
                      // overrides it with a colour of its own.
                      className="group flex items-center gap-4 p-4 no-underline transition-colors hover:bg-foreground hover:text-background"
                    >
                      {/* The line, then the icon — the same pair the desktop
                          tab and the compact bar carry, so a reader arriving
                          from either recognises the row. */}
                      <TrackSwatch track={INTENT_TRACK[intent.id] ?? 'pink'} />
                      <Icon size={20} className="shrink-0" aria-hidden />
                      <span className="flex flex-col">
                        <span className="text-15 font-bold">
                          {t(intent.labelKey, intent.fallback)}
                        </span>
                        {/* `text-muted-foreground`, NOT `opacity-70`.
                            Element opacity fades the type toward the surface
                            rather than choosing a colour, and axe measured the
                            result at **3.19:1** on prod (#a3a39f on #50504d)
                            against the 4.5:1 that 10px normal-weight text
                            requires. `--muted-foreground` is contrast-gated by
                            tokenContrast.test.ts, so it cannot drift there.

                            The hover arm is the other half: the row inverts to
                            ink, and muted (#545454) on ink is the 2.49:1 case
                            NavTab documents — paper at 70% composites to
                            9.1:1, which is the value that file settled on. */}
                        <span className="text-2xs leading-tight text-muted-foreground group-hover:text-background/70">
                          {t(intent.subtitleKey, intent.subtitleFallback)}
                        </span>
                      </span>
                    </LocalizedLink>
                  );
                })}
              </div>
            </div>

            {/* Every destination stays reachable — the intent row is additive,
                never a replacement. Single-sourced from config/navigation.ts. */}
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('header.intents.browseHeading', 'Browse everything')}
            </h3>
            {NAV_CLUSTERS.map((cluster) => {
              const items = DESTINATIONS.filter((d) => d.cluster === cluster.id);
              if (!items.length) return null;
              return (
                <div key={cluster.id} className="flex flex-col gap-2">
                  {/* `h4`, not `h3`: a cluster is a SUBSECTION of "Browse
                      everything" above, and sharing its level flattened the
                      structure for rotor navigation. Axe's `heading-order`
                      cannot see this — it only fires on a skipped level, and
                      h3→h3 skips nothing. */}
                  <h4 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(cluster.labelKey)}
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((dest) => {
                      const Icon = dest.icon;
                      return (
                        <LocalizedLink
                          key={dest.to}
                          to={dest.to}
                          onClick={close}
                          aria-current={isHere(dest.to) ? 'page' : undefined}
                          className="flex flex-col items-center justify-center gap-2 p-4 text-center no-underline transition-colors hover:bg-foreground hover:text-background"
                        >
                          <Icon size={20} aria-hidden />
                          {/* `truncate` — at 320px a grid cell is ~58px wide
                              and labels like "Personalities" /
                              "Persönlichkeiten" ran past it. */}
                          <span className="w-full truncate text-2xs font-bold leading-tight">
                            {t(dest.labelKey)}
                          </span>
                        </LocalizedLink>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Account actions */}
            <div className="flex flex-col gap-2 pt-4">
              {/* `p-4`, not `p-2`. Every navigable row in this sheet is `p-4`
                  (intents, trips, friends, the browse grid) and only these
                  three were `p-2` — the same row type at two paddings. `p-4`
                  is both the majority and the touch-friendlier of the two. */}
              {isAdmin || isModerator ? (
                <LocalizedLink
                  to="/admin"
                  onClick={close}
                  className="flex items-center gap-2 rounded-element p-4 text-15 no-underline hover:bg-muted"
                >
                  <Shield size={16} />
                  <span>{t('header.adminConsole', 'Admin Console')}</span>
                </LocalizedLink>
              ) : null}
              {LEGAL_ITEMS.map((item) => (
                <LocalizedLink
                  key={item.to}
                  to={item.to}
                  onClick={close}
                  aria-current={isHere(item.to) ? 'page' : undefined}
                  className="flex items-center gap-2 rounded-element p-4 text-15 text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                >
                  <item.icon size={16} />
                  <span>{t(item.labelKey)}</span>
                </LocalizedLink>
              ))}
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void signOut();
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-element p-4 text-left text-15 text-destructive',
                    'hover:bg-muted',
                  )}
                >
                  <LogOut size={16} />
                  <span>{t('header.signOut', 'Sign Out')}</span>
                </button>
              )}
            </div>

            {/* Display controls */}
            <div className="flex flex-col gap-2 pt-4">
              {/* A sibling section of the sheet's own title, so `h3` is the
                  right level here — unlike the cluster headings above, which
                  nest under "Browse everything". */}
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('header.mobileNav.settingsSection', 'Display')}
              </h3>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <CurrencySelector />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
