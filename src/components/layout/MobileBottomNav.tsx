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
 * button between Explore and Hub. Explore opens the intent sheet — the
 * "what are you here for?" chooser — on tap; long-press does the same and is
 * now only a shortcut, not the sole route. Its href stays `/search` so
 * middle-click and no-JS still reach discovery. Hub carries the unread badge;
 * You shows the signed-in avatar. Auth-only destinations gate on tap. The
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

  // The chevron is a hint, not a control: since Explore's own tap opens the
  // sheet, a second button doing the same thing would be a duplicate target.
  // It stays because it still carries the trip-count dot and reads as "there
  // is more above". `pointer-events-none` lets taps fall through to the tab.
  const exploreAccessory = (
    <span className="pointer-events-none absolute end-0 top-0 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground">
      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      {!!user && tripCount > 0 && (
        <NavBadge
          dot
          label={t('header.mobileNav.tripsBadge', '{{count}} trip items need attention', {
            count: tripCount,
          })}
        />
      )}
    </span>
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
        {/* Squared, ruled and opaque. The translucent blurred capsule this
            replaces was the mobile counterpart of the frosted top bar the
            header explicitly rejects: over a paper page a 90%-opaque blur
            reads as a third, muddier surface, and the active tab's ink fill
            has nothing solid to sit against. Same box as the header's. */}
        <ul className="mx-4 mb-2 flex items-stretch gap-1 border-[3px] border-foreground bg-background px-2">
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
                // Explore opens the intent sheet on TAP. Previously the sheet
                // was reachable only by long-press, with a 24px chevron as its
                // sole affordance — an undiscoverable gesture cannot be the
                // entry to primary navigation. `/search` stays one keystroke
                // away (⌘K) and is the whole mobile header row, and the tab
                // keeps its href so middle-click still opens it.
                onIntercept={
                  isExplore
                    ? // onTap already fired the haptic — openHub would double it.
                      () => setSheetOpen(true)
                    : anonGated
                      ? () => navigate('/auth', { state: { from: tab.to } })
                      : undefined
                }
                hasPopup={isExplore}
                expanded={isExplore ? sheetOpen : undefined}
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
