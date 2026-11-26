import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MobileNavSheet } from '@/components/layout/MobileNavSheet';
import { MobileYouSheet } from '@/components/layout/MobileYouSheet';
import { MobileHubSheet } from '@/components/hub/MobileHubSheet';
import { NavTab } from '@/components/layout/bottom-nav/NavTab';
import { NavBadge } from '@/components/layout/bottom-nav/NavBadge';
import { BOTTOM_NAV_TABS, type BottomNavTab } from '@/config/navigation';
import type { Track } from '@/components/transit/routeBulletMap';

// Hover colour per tab.
const TAB_TRACK: Record<BottomNavTab['id'], Track> = {
  home: 'blue',
  explore: 'green',
  hub: 'yellow',
  you: 'pink',
};
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { useInboxRealtime, useInboxUnreadCounts } from '@/hooks/useInboxFeed';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useHaptics } from '@/hooks/useHaptics';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLongPress } from '@/hooks/useLongPress';
import { useMotionTokens } from '@/lib/motion';
import { stripLocale, isMapRoute } from '@/lib/locale';

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
 * Home · Explore · Hub · You. Contributing lives in the Hub menu's Contribute
 * tab. Explore opens the intent sheet — the
 * "what are you here for?" chooser — on tap; long-press does the same and is
 * now only a shortcut, not the sole route. Its href stays `/search` so
 * middle-click and no-JS still reach discovery. Hub opens its section sheet
 * from the dock. The Hub sheet holds the inbox, so unread messages and alerts badge the Hub tab. You shows the signed-in avatar. Auth-only destinations gate on tap. The
 * dock never scrolls away (spec panel 12), honours safe-area-inset-bottom,
 * hides on md+ and on the full-bleed /map.
 */
export function MobileBottomNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const navigate = useLocalizedNavigate();
  const { trigger } = useHaptics();
  const { reduced } = useMotionTokens();
  const tripCount = useInboxBadge();
  const isMobile = useIsMobile();
  // Phones have no header Inbox; the dock mounts the realtime channel instead
  // (ref-counted, so md+ sharing it with the header costs nothing).
  useInboxRealtime();
  const unread = useInboxUnreadCounts().all;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetByPointer, setSheetByPointer] = useState(false);
  const [hubOpening, setHubOpening] = useState<{ path: string; byPointer: boolean } | null>(null);
  const hubTrigger = useRef<HTMLAnchorElement>(null);
  const [you, setYou] = useState<{ byPointer: boolean } | null>(null);
  const youTrigger = useRef<HTMLAnchorElement>(null);
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);

  // Publish how much of the viewport bottom the dock occupies, so other
  // bottom-fixed chrome (the cookie banner) can sit above it instead of
  // covering it. Measured, never a constant: the safe area differs per phone. Cleared when the
  // dock is hidden (md+ via CSS, or the full-bleed map, where it unmounts).
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty('--dock-clearance');
    if (!navEl) {
      clear();
      return;
    }
    const publish = () => {
      const tops = [navEl, ...Array.from(navEl.querySelectorAll('button'))]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0)
        .map((r) => r.top);
      if (tops.length === 0) {
        clear();
        return;
      }
      root.style.setProperty(
        '--dock-clearance',
        `${Math.round(window.innerHeight - Math.min(...tops))}px`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(navEl);
    window.addEventListener('resize', publish);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', publish);
      clear();
    };
  }, [navEl]);

  const openExplore = () => {
    trigger('nudge');
    setSheetOpen(true);
  };
  const exploreLongPress = useLongPress(openExplore);

  if (isMapRoute(pathname)) return null;

  const path = stripLocale(pathname);
  const inHub = path === '/hub' || path.startsWith('/hub/');
  const hubSheetOpen = isMobile && hubOpening?.path === pathname;
  const openHub = (event: MouseEvent<HTMLAnchorElement>) => {
    hubTrigger.current = event.currentTarget;
    setHubOpening({ path: pathname, byPointer: event.detail > 0 });
  };
  const tapHaptic = () => trigger('nudge');

  // A real picture or nothing: the generated initials disc read as a letter,
  // not as "you". Without an uploaded photo the tab keeps its person icon.
  const avatarSrc = (profile?.avatar_url as string | null | undefined) || undefined;
  const avatarInitial = ((profile?.display_name as string | null) || user?.email || 'U')
    .charAt(0)
    .toUpperCase();

  // Decoration only: the trip-count dot pinned to Explore's icon corner.
  // `aria-haspopup` already says the tab opens a sheet, so the old chevron
  // hint is gone. `pointer-events-none` lets taps fall through to the tab.
  const exploreAccessory = (
    <span className="pointer-events-none absolute start-1/2 top-2 ms-5 flex">
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
        ref={setNavEl}
        aria-label={t('header.navigation', 'Navigation')}
        className="md:hidden fixed inset-x-0 z-40"
        // §10 rule 4: "The dock owns the bottom on phones. Five tracks, 48px
        // targets, sitting above the safe area. It never hides behind a menu
        // icon and NEVER SCROLLS AWAY."
        //
        // It used to translate off-screen on scroll-down (`useScrollDirection`).
        // That is the behaviour the rule names, and it is not a small nicety:
        // the dock is the only navigation on a phone now that nothing collapses
        // into a hamburger, so hiding it on the gesture people use most leaves
        // a reader mid-page with no way out but the browser's own back button.
        //
        // `bottom` is the inset plus the safe area, for the same reason the
        // header adds them rather than choosing between them: on a notched
        // phone the dock has to clear the home indicator AND keep its own gap.
        style={{
          bottom: 'calc(var(--island-inset) + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* The island dock (spec panel 12): ink surface, island radius and the
            deepest shadow in the system, inset by the same gap as the top bar.
            Opaque, never blurred — over a paper page a 90%-opaque blur reads
            as a third, muddier surface, and the active tab has nothing solid
            to sit against. */}
        <ul className="island island-dock island-ink flex items-center gap-0.5 bg-foreground px-1.5 text-background">
          {BOTTOM_NAV_TABS.map((tab) => {
            const isExplore = tab.id === 'explore';
            const isHub = tab.id === 'hub';
            const isYou = tab.id === 'you' && !!user;
            const anonGated = tab.authGated && !user;
            // The "You" tab points at the own public profile, which needs the
            // signed-in user's id (config can't hold it).
            const to = tab.id === 'you' && user ? `/user/${user.id}` : tab.to;
            const navTab = (
              <NavTab
                key={tab.id}
                to={to}
                icon={tab.icon}
                track={TAB_TRACK[tab.id]}
                label={t(tab.labelKey, FALLBACK_LABEL[tab.id])}
                active={inHub ? isHub : isTabActive(tab, path)}
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
                    ? // onTap already fired the haptic — openExplore would double it.
                      (event: MouseEvent<HTMLAnchorElement>) => {
                        setSheetByPointer(event.detail > 0);
                        setSheetOpen(true);
                      }
                    : isHub
                      ? openHub
                      : isYou
                        ? (event: MouseEvent<HTMLAnchorElement>) => {
                            youTrigger.current = event.currentTarget;
                            setYou({ byPointer: event.detail > 0 });
                          }
                        : anonGated
                          ? () => navigate('/auth', { state: { from: tab.to } })
                          : undefined
                }
                hasPopup={isExplore || isHub || isYou}
                expanded={isExplore ? sheetOpen : isYou ? !!you : hubSheetOpen}
                avatar={
                  tab.avatar && user && avatarSrc
                    ? { src: avatarSrc, initial: avatarInitial }
                    : null
                }
                badgeCount={isHub && user ? unread : undefined}
                badgeLabel={
                  isHub
                    ? t('header.hub.unread', 'Hub, {{count}} unread', { count: unread })
                    : undefined
                }
                longPress={isExplore ? exploreLongPress : undefined}
                accessory={isExplore ? exploreAccessory : undefined}
              />
            );
            return navTab;
          })}
        </ul>
      </nav>

      <MobileNavSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        openedByPointer={sheetByPointer}
      />
      <MobileHubSheet
        open={hubSheetOpen}
        openedByPointer={hubOpening?.byPointer ?? false}
        onOpenChange={(open) => {
          if (!open) setHubOpening(null);
        }}
        onDismissFocus={() => {
          setHubOpening(null);
          hubTrigger.current?.focus({ preventScroll: true });
        }}
      />
      <MobileYouSheet
        open={!!you}
        openedByPointer={you?.byPointer ?? false}
        onOpenChange={(open) => {
          if (!open) setYou(null);
        }}
        onDismissFocus={() => {
          setYou(null);
          youTrigger.current?.focus({ preventScroll: true });
        }}
      />
    </>
  );
}
