import { Fragment, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { MobileNavSheet } from '@/components/layout/MobileNavSheet';
import { NavTab } from '@/components/layout/bottom-nav/NavTab';
import { NavContributeButton } from '@/components/layout/bottom-nav/NavContributeButton';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { BOTTOM_NAV_TABS, type BottomNavTab } from '@/config/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useHaptics } from '@/hooks/useHaptics';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useLongPress } from '@/hooks/useLongPress';
import { useMotionTokens } from '@/lib/motion';
import { duration } from '@/lib/animation';
import { getSubmitCta } from '@/lib/submitCta';
import { generateAvatarUrl } from '@/lib/avatar';
import { stripLocale, isMapRoute } from '@/lib/locale';

/** Stay visible within this many px of the top (above the fold). */
const SCROLL_TOP_OFFSET = 80;

const FALLBACK_LABEL: Record<BottomNavTab['id'], string> = {
  home: 'Home',
  explore: 'Explore',
  hub: 'Hub',
  you: 'You',
};

function isTabActive(tab: BottomNavTab, path: string): boolean {
  return tab.activePrefixes.some((p) =>
    p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`),
  );
}


/**
 * Mobile-only floating-island bottom nav. Four destination tabs —
 * Home · Explore · Hub · You — plus a raised, context-aware contribute
 * button between Explore and Hub. Every tab deep-links: Explore goes to
 * the discovery surface (`/search`); the full destination hub is one
 * long-press away on Explore (with a chevron affordance as the keyboard /
 * screen-reader equivalent). Hub carries the unread badge; You shows the
 * signed-in avatar. Auth-only destinations gate on tap (anon → sign-in). The
 * bar slides away on scroll-down and returns on scroll-up (disabled under
 * reduced motion), honours safe-area-inset-bottom, hides on md+ and on the
 * full-bleed /map.
 */
export function MobileBottomNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const navigate = useLocalizedNavigate();
  const { trigger } = useHaptics();
  const { reduced } = useMotionTokens();
  const scrollDir = useScrollDirection({ topOffset: SCROLL_TOP_OFFSET });
  const { unreadCount } = useInboxFeed('all');
  const tripCount = useInboxBadge();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const openHub = () => {
    trigger('nudge');
    setSheetOpen(true);
  };
  const exploreLongPress = useLongPress(openHub);

  if (isMapRoute(pathname)) return null;

  const path = stripLocale(pathname);
  const tapHaptic = () => trigger('nudge');
  // Slide off-screen on scroll-down (keep visible while the hub is open).
  const hidden = !reduced && scrollDir === 'down' && !sheetOpen;

  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);
  const avatarInitial = ((profile?.display_name as string | null) || user?.email || 'U')
    .charAt(0)
    .toUpperCase();

  const cta = getSubmitCta(pathname, t);
  const handleContribute = () => {
    tapHaptic();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    navigate(cta.route);
  };

  // Keyboard / screen-reader equivalent of the long-press: opens the same hub.
  const exploreAccessory = (
    <button
      type="button"
      onClick={openHub}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      aria-label={t('header.mobileNav.browseAll', 'Browse all sections')}
      className="absolute end-0 top-0 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      {!!user && tripCount > 0 && (
        <NavBadge
          dot
          label={t('header.mobileNav.tripsBadge', '{{count}} trip items need attention', {
            count: tripCount,
          })}
        />
      )}
    </button>
  );

  return (
    <>
      <nav
        aria-label={t('header.navigation', 'Navigation')}
        className="md:hidden fixed inset-x-0 bottom-0 z-40"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: hidden ? 'translateY(calc(100% + 1rem))' : 'translateY(0)',
          transition: reduced
            ? undefined
            : `transform ${duration.normal}s cubic-bezier(0.22,1,0.36,1)`,
        }}
      >
        <ul className="mx-4 mb-2 flex items-stretch gap-1 rounded-container border border-border bg-background/90 px-2 backdrop-blur-md">
          {BOTTOM_NAV_TABS.map((tab) => {
            const isExplore = tab.id === 'explore';
            const anonGated = tab.authGated && !user;
            const showUnread = tab.badge === 'unread' && !!user;
            // The "You" tab points at the own public profile, which needs the
            // signed-in user's id (config can't hold it).
            const to = tab.id === 'you' && user ? `/user/${user.id}` : tab.to;
            const navTab = (
              <NavTab
                key={tab.id}
                to={to}
                icon={tab.icon}
                label={t(tab.labelKey, FALLBACK_LABEL[tab.id])}
                active={isTabActive(tab, path)}
                reduced={reduced}
                onTap={tapHaptic}
                onGate={anonGated ? () => navigate('/auth', { state: { from: tab.to } }) : undefined}
                badgeCount={showUnread ? unreadCount : undefined}
                badgeLabel={
                  showUnread
                    ? t('header.mobileNav.unreadCount', '{{count}} unread', { count: unreadCount })
                    : undefined
                }
                avatar={tab.avatar && user ? { src: avatarSrc, initial: avatarInitial } : null}
                longPress={isExplore ? exploreLongPress : undefined}
                accessory={isExplore ? exploreAccessory : undefined}
              />
            );
            // Inject the raised contribute button right after Explore.
            if (isExplore) {
              return (
                <Fragment key="explore-group">
                  {navTab}
                  <NavContributeButton
                    label={
                      user ? cta.label : t('header.signInToContribute', 'Sign in to contribute')
                    }
                    onClick={handleContribute}
                  />
                </Fragment>
              );
            }
            return navTab;
          })}
        </ul>
      </nav>

      <MobileNavSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
