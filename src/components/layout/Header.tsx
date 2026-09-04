import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { LogOut, Shield, UserRound } from 'lucide-react';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { TrackSwatch } from '@/components/transit/TrackSwatch';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { stripLocale } from '@/lib/locale';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { generateAvatarUrl } from '@/lib/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import {
  USER_MENU_ITEMS as userMenuItems,
  INTENT_NAV,
  INTENT_TRACK,
  isIntentActive,
} from '@/config/navigation';
import { getSubmitCta } from '@/lib/submitCta';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import { Wordmark } from '@/components/brand/Wordmark';
import { useCompactHeader } from '@/hooks/useCompactHeader';
import { cn } from '@/lib/utils';
import { PAGE_GUTTER } from '@/components/layout/PageContainer';

// ── Component ───────────────────────────────────────────────────────────────

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const compact = useCompactHeader();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin, isModerator } = useAdminRoles();

  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);

  const submitCta = getSubmitCta(location.pathname, t);
  // Declared here, not next to desktopNav: rightCluster's JSX reads it and is
  // evaluated at its own const assignment above, so a later declaration is a
  // temporal-dead-zone crash on every render.
  const path = stripLocale(location.pathname);

  const displayName = (profile?.display_name as string | null) || null;
  const username = (profile?.username as string | null) || null;
  const avatarInitial = (displayName || user?.email || 'U').charAt(0).toUpperCase();

  // Published branding overrides (/admin/design). Defaults render when unset.
  const branding = useSiteBranding();
  const siteName = branding.siteName ?? 'Queer Guide';
  // Stacked wordmark: split the site name into two lines on the first space.
  const [wordmarkTop, ...wordmarkRest] = siteName.split(' ');
  const wordmarkBottom = wordmarkRest.join(' ');

  // ── Render ──────────────────────────────────────────────────────────────

  // ── Brand + right action cluster (shared by mobile row & desktop grid) ───
  const brand = (
    <Link to="/" aria-label={siteName} className="flex items-center gap-2.5 shrink-0 no-underline">
      {branding.logoUrl ? (
        // /admin/design custom-logo escape hatch keeps the img branch.
        <>
          <img
            src={branding.logoUrl}
            alt=""
            aria-hidden="true"
            tabIndex={-1}
            className="transition-transform duration-fast hover:-rotate-6 hover:scale-110 active:scale-95 object-contain"
            style={{ height: 34, width: 34 }}
          />
          <span className="hidden flex-col font-display text-base font-bold leading-[1.1] tracking-tight text-foreground md:flex">
            <span>{wordmarkTop}</span>
            {wordmarkBottom && <span>{wordmarkBottom}</span>}
          </span>
        </>
      ) : (
        // The wordmark IS the logo: "It carries no symbol, no container and no
        // colour" (Brand Guidelines §03). The "Cupid's transit" mark that used
        // to sit beside it here is retired — it survives only on the design
        // project's Logo Options sheet as history.
        //
        // So the wordmark can no longer be dropped below `sm`, which is what it
        // did while the mark was there to carry the brand at 320px. It steps
        // down instead, and the bottom step is 17px rather than the 32px of
        // --text-headline (which measures 142px and left the search field
        // unusable at 320px, plus 94 axe `target-size` violations). §03 puts the
        // floor at 16px on screen, so 17px is inside the rule with a little air.
        <Wordmark className="text-body-lg text-foreground sm:text-title md:text-headline" />
      )}
    </Link>
  );

  // Contribute — the mock's ink-filled CTA. It carries its label from `lg:` up
  // and collapses to a square icon below that: at 768–1023px the tab row, the
  // search field and this button share one line, and a labelled button there
  // pushed the six tabs into a wrap. The accessible name is the label either
  // way, so the collapse is visual only.
  const contributeLabel = user
    ? submitCta.label
    : t('header.signInToContribute', 'Sign in to contribute');
  const contribute = (
    <Button
      variant="default"
      size="sm"
      onClick={() => (user ? navigate(submitCta.route) : setAuthDialogOpen(true))}
      aria-label={contributeLabel}
      title={contributeLabel}
      className="h-10 w-10 shrink-0 gap-2 p-0 lg:w-auto lg:px-4"
    >
      <TransitIcon name="add-station" size={20} />
      <span className="hidden lg:inline">{contributeLabel}</span>
    </Button>
  );

  const rightCluster = (
    <div className="flex items-center gap-2 flex-shrink-0">
      {contribute}

      {/* "Mine" — the second axis. Intents answer WHAT I WANT TO DO; this
          answers WHERE MY THINGS ARE (trips, saved, messages, plans). /hub was
          reachable on desktop only by opening the avatar dropdown, so half the
          product had no visible entry point at all. Rendered outside the
          intent <nav> on purpose: it is not a sixth peer job, and putting it
          in that landmark would read as one. */}
      {user && (
        <LocalizedLink
          to="/hub"
          aria-current={path === '/hub' || path.startsWith('/hub/') ? 'page' : undefined}
          title={t('header.mobileNav.hub', 'Hub')}
          className="hidden items-center gap-2 px-2 py-2 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground md:inline-flex"
        >
          <TransitIcon name="home-base" size={18} />
          <span className="sr-only lg:not-sr-only">{t('header.mobileNav.hub', 'Hub')}</span>
        </LocalizedLink>
      )}

      {user && (
        <span className="hidden md:inline-flex">
          <NotificationBell />
        </span>
      )}

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              style={{ height: 40, width: 40 }}
              className="p-0"
              aria-label={t('header.openUserMenu', 'Open user menu')}
            >
              <Avatar style={{ height: 36, width: 36 }}>
                <AvatarImage src={avatarSrc} alt={displayName || 'Your account'} />
                <AvatarFallback>{avatarInitial}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" style={{ width: 280, zIndex: 50 }}>
            {/* Identity — leads the menu, links to the personal /hub office */}
            <DropdownMenuLabel className="p-0 font-normal">
              <LocalizedLink
                to="/hub"
                className="flex items-center gap-2 rounded-element p-2 no-underline"
              >
                <Avatar style={{ height: 36, width: 36 }}>
                  <AvatarImage src={avatarSrc} alt="" />
                  <AvatarFallback>{avatarInitial}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col">
                  {username ? (
                    <span className="truncate font-mono text-sm font-semibold">@{username}</span>
                  ) : (
                    <span className="truncate text-sm font-semibold">
                      {user.email || t('header.userMenu.you', 'You')}
                    </span>
                  )}
                </span>
              </LocalizedLink>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <LocalizedLink to={`/user/${user.id}`} className="flex gap-2 no-underline">
                <UserRound size={16} />
                <span>{t('header.userMenu.viewProfile', 'View public profile')}</span>
              </LocalizedLink>
            </DropdownMenuItem>

            {/* Theme switch removed 2026-08: dark mode dropped with the
                subway-map rebrand (fixed paper/ink poster identity). */}

            {userMenuItems.map((item) => (
              <DropdownMenuItem asChild key={item.to}>
                <LocalizedLink to={item.to} className="flex gap-2 no-underline">
                  <item.icon size={16} />
                  <span>{t(item.labelKey)}</span>
                </LocalizedLink>
              </DropdownMenuItem>
            ))}

            {(isAdmin || isModerator) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <LocalizedLink to="/admin" className="flex gap-2 no-underline">
                    <Shield size={16} />
                    <span>{t('header.adminConsole', 'Admin Console')}</span>
                  </LocalizedLink>
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => signOut()}
              className="flex gap-2 text-destructive focus:text-destructive"
            >
              <LogOut size={16} />
              <span>{t('header.signOut', 'Sign Out')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAuthDialogOpen(true)}
          aria-label={t('header.signIn', 'Sign in')}
        >
          {t('header.signIn', 'Sign in')}
        </Button>
      )}
    </div>
  );

  // ── Desktop primary nav — the Intent Router row, as TRACK TABS.
  // Single-sourced from INTENT_NAV in src/config/navigation.ts. This array used
  // to be hardcoded here and had silently diverged from the config's
  // PRIMARY_NAV, leaving /venues (the largest catalog) and /people unreachable
  // from desktop chrome. Never re-inline it.
  //
  // Design contract ("Header and Footer.dc.html", panel 01): every tab carries
  // a 6px rule and the ACTIVE tab reverses to an ink fill. "Colour appears
  // once: as the rule under the active section" — so inactive rules are
  // transparent, not a muted tint.
  const desktopNav = (
    // Distinct landmark name — the mobile bottom bar owns "Navigation";
    // duplicate nav landmark names break rotor navigation (landmark-unique).
    // `md:` not `lg:` — useIsMobile flips at md (768) and MobileBottomNav is
    // md:hidden, so `hidden lg:flex` left 768–1023px with no primary nav.
    <nav
      aria-label={t('header.primaryNavigation', 'Primary')}
      className="hidden items-stretch md:flex"
    >
      {INTENT_NAV.map((intent) => {
        const { to, labelKey, fallback, id, icon: Icon } = intent;
        const active = isIntentActive(intent, path);
        const label = t(labelKey, fallback);
        const track = INTENT_TRACK[id] ?? 'pink';
        return (
          <LocalizedLink
            key={to}
            to={to}
            title={label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col justify-end no-underline transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-foreground hover:bg-surface-container',
            )}
          >
            {/* Icon + label, per the mock's nav row. The icon is a TransitIcon
                binding (see INTENT_NAV) drawing in currentColor, so it inverts
                with the active tab's ink fill for free — no active variant. */}
            <span className="flex items-center gap-2 whitespace-nowrap px-2.5 pb-2 pt-4 text-15 font-bold lg:px-6">
              <Icon size={18} className="shrink-0" />
              {label}
            </span>
            <span
              aria-hidden
              className={cn(
                'h-1.5',
                active
                  ? {
                      pink: 'bg-track-pink',
                      blue: 'bg-track-blue',
                      green: 'bg-track-green',
                      yellow: 'bg-track-yellow',
                    }[track]
                  : 'bg-transparent',
              )}
            />
          </LocalizedLink>
        );
      })}
    </nav>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  // Design contract, panel 02: "On scroll the bar reverses to ink and drops to
  // one line, carrying the current track colour and the page action with it.
  // Nothing else survives the collapse."
  const activeIntent = INTENT_NAV.find((i) => isIntentActive(i, path));
  const activeTrack = activeIntent ? (INTENT_TRACK[activeIntent.id] ?? 'pink') : 'pink';
  const ActiveIntentIcon = activeIntent?.icon;

  return (
    <header
      // A floating island (spec panels 10-12), not a bar welded to the window
      // edge: inset on every side so the page's own ground shows through, and
      // separated by elevation alone. The border is GONE on purpose — §10
      // rule 3, "Elevation is the only edge. No keyline on an island."
      //
      // `sticky`, not `fixed`. The spec's demo overlays the island on padded
      // content; sticky keeps the island in flow, which means the first
      // screenful is not underlapped at rest but every page keeps its own top
      // spacing and nothing needs a global scroll-padding. The moment the
      // reader scrolls, content passes beneath it exactly as drawn.
      //
      // No backdrop blur: the compact state is a solid ink flood, and a
      // blurred translucent bar under it reads as a third, muddier surface.
      //
      // The compact state changes only the SURFACE, never the box — §11,
      // "The gap to the page edge never changes, so the bar appears to shrink
      // in place rather than dock."
      // `island-capped`, not bare `island`: the plate stops at the page cap
      // instead of spanning the window. Without it the bar kept widening while
      // its contents stayed capped at --container-page, so past ~1710px the
      // plate grew empty ears — 205px of blank bar on each side at 1990px.
      // Capping the plate makes its box the page's own container box, so the
      // wordmark and the tab row still land on the page content's vertical.
      className={cn(
        'island island-capped sticky',
        compact && !isMobile ? 'island-ink bg-foreground text-background' : 'bg-background',
      )}
      // z-40, NOT the 1100 this carried before. Every portaled overlay in the
      // app — dialog, alert-dialog, dropdown, popover, select, sheet, tooltip,
      // and this header's OWN avatar menu and mobile search sheet — renders at
      // z-50 on document.body. 1100 only ever looked harmless because the
      // header sat inside a `relative z-10` wrapper that capped it; the moment
      // it became a root-level child (so it could actually stick) that 1100
      // entered the root stacking context and painted the bar over all of
      // them, which is how the mobile search sheet's Cancel button ended up
      // unclickable behind the wordmark. 40 keeps the header above page
      // content and the sticky page bars (z-20/z-30) and level with
      // MobileBottomNav, while staying under the z-50 overlay layer.
      // `top` is the island inset, not 0, so the gap above the bar is the same
      // gap as the one at its sides — that symmetry is the whole point of the
      // island. The safe-area inset is ADDED to it rather than replacing the
      // padding it used to carry: on a notched phone the island has to clear
      // the notch and still keep its own gap.
      // The margin is what makes the gap exist AT REST; `top` is what keeps it
      // once the bar sticks. Both are the same value, so the island does not
      // jump when it detaches — §10 rule 1, "The gap is fixed; it does not
      // tighten on scroll."
      style={{
        zIndex: 40,
        top: 'calc(var(--island-inset) + env(safe-area-inset-top, 0px))',
        marginTop: 'calc(var(--island-inset) + env(safe-area-inset-top, 0px))',
      }}
    >
      {compact && !isMobile ? (
        /* ── 02 · Compact, after scroll — one ink line ────────────────── */
        <div
          className={cn(
            'mx-auto flex w-full max-w-page flex-wrap items-center gap-4 py-2',
            PAGE_GUTTER,
          )}
        >
          {/* `flex items-center`, not a bare block: the wordmark span is an
              inline-block, so a block link boxes it against the line's strut
              and Anton's own metrics leave the ink hanging at the TOP of a
              44px box. Measured on prod at 1440: 12px above the mark, 27px
              below it, in a bar whose every other item is centred. Making the
              link a flex row centres the span box itself — 20/19. */}
          <Link to="/" className="flex items-center no-underline" aria-label={siteName}>
            <Wordmark className="text-title text-background" />
          </Link>
          {activeIntent && ActiveIntentIcon && (
            /* The collapsed bar carries the same two signals as the expanded
               tab — the line and the job — so scrolling never costs the reader
               their position in the network. On ink the swatch drops its rim:
               a paper hairline around an 8px pill reads as a second pill. */
            <span className="flex items-center gap-2 text-15 font-bold">
              <TrackSwatch track={activeTrack} tone="ink" />
              <ActiveIntentIcon size={18} className="shrink-0" />
              {t(activeIntent.labelKey, activeIntent.fallback)}
            </span>
          )}
          <span className="ms-auto flex items-center gap-2">{rightCluster}</span>
        </div>
      ) : (
        <>
          {/* ── 01 · Primary. Search is the WIDEST thing in the bar: on a map
               product it is the main verb. ─────────────────────────────── */}
          <div className={cn('mx-auto w-full max-w-page', PAGE_GUTTER)}>
            {isMobile ? (
              <div className="flex items-center gap-2" style={{ height: 56 }}>
                {brand}
                {/* `collapse`: below `sm` the search is the mock's ICON, not a
                    field (panel 06 — brand, search icon, avatar). A field
                    cannot share a 320px row with the wordmark and the action
                    cluster; it measured 14.7px wide and the axe sweep returned
                    43 serious `target-size` failures on it. */}
                <div className="mx-2 flex min-w-0 flex-1 justify-end sm:justify-stretch">
                  <UniversalSearchBar collapse />
                </div>
                {rightCluster}
              </div>
            ) : (
              <div className="flex items-center gap-4" style={{ height: 68 }}>
                <div className="flex shrink-0 items-center gap-2.5">{brand}</div>
                <div className="min-w-0 flex-1">
                  <UniversalSearchBar />
                </div>
                <div className="shrink-0">{rightCluster}</div>
              </div>
            )}
          </div>

          {/* ── Track tabs under a 3px rule, so each tab's 6px track rule
               lands on the bar's own bottom edge. Mobile keeps the bottom
               bar (MobileBottomNav) as its track row. ─────────────────── */}
          {!isMobile && (
            /* The 3px rule spans the viewport (it is the bar's edge); the tabs
               inside it take the page cap so tab 1 starts on the same vertical
               as the page content below. */
            <div className="border-t border-border-hairline">
              {/* Seven tabs overflow 768–1023px viewports; the row scrolls
                  (never wraps or clips) with tighter md padding on the tabs
                  themselves. This IS the "different layout" the old six-tab
                  ceiling comment in navigation.test.ts demanded. */}
              <div
                className={cn(
                  'no-scrollbar mx-auto flex w-full max-w-page items-stretch overflow-x-auto',
                  PAGE_GUTTER,
                )}
              >
                {desktopNav}
              </div>
            </div>
          )}
        </>
      )}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}
