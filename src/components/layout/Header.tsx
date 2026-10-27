import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { LogOut, Shield, UserRound, Users } from '@/components/icons';
import { TransitIcon } from '@/components/transit/TransitIcon';
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
import { useFriendsOnlineCount } from '@/hooks/useFriendIds';
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
import { IdentityRow } from '@/components/layout/IdentityRow';
import { FriendsOnlineCount } from '@/components/layout/FriendsOnlineCount';

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

  const friendsOnline = useFriendsOnlineCount(user?.id);

  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);

  const submitCta = getSubmitCta(location.pathname, t);
  // Declared up here, above every render helper that reads it. It used to be a
  // temporal-dead-zone hazard because the helpers were `const`s whose JSX was
  // evaluated at assignment time; they are functions now, so the ordering is
  // no longer load-bearing — but keeping the declaration first costs nothing.
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
    <Link
      to="/"
      aria-label={siteName}
      className="flex min-h-11 items-center gap-2.5 shrink-0 no-underline"
    >
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
          {/* `text-15`, not `text-base`: 16px is raw Tailwind and off the
              micro-scale ladder.
              NOT `text-title` — this span is `font-display`, and rank 4 is
              Space Grotesk, so the pair is the exact violation
              rankFourFace.test.ts bans (it caught this on the first run).
              15px is the nearest micro-scale token to the 16px it replaces,
              which matters because this is a two-line stacked name set against
              a 34px logo: 15 × 1.1 × 2 ≈ 33px keeps them the same height,
              where rank 4 would be 44px and rank 3 would be 70px in a 52px
              bar. */}
          <span className="hidden flex-col font-display text-15 font-bold leading-[1.1] tracking-tight text-foreground md:flex">
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
  // pushed the seven tabs into a wrap. The accessible name is the label either
  // way, so the collapse is visual only.
  const contributeLabel = user
    ? submitCta.label
    : t('header.signInToContribute', 'Sign in to contribute');

  // `onInk` is threaded through rather than inherited, because every variant
  // below sets its own colour explicitly and so beats anything the header
  // element passes down. See the `reversed` / `ghostReversed` comment in
  // button.tsx for the measurement that forced this.
  const renderContribute = (onInk: boolean) => (
    <Button
      variant={onInk ? 'reversed' : 'default'}
      size="sm"
      onClick={() => (user ? navigate(submitCta.route) : setAuthDialogOpen(true))}
      aria-label={contributeLabel}
      title={contributeLabel}
      className="h-11 w-11 shrink-0 gap-2 p-0 lg:w-auto lg:px-4"
    >
      <TransitIcon name="add-station" size={24} />
      <span className="hidden lg:inline">{contributeLabel}</span>
    </Button>
  );

  const renderRightCluster = (onInk: boolean) => (
    <div className="flex items-center gap-2 flex-shrink-0">
      {renderContribute(onInk)}

      {user && (
        <span className="hidden md:inline-flex">
          <NotificationBell onInk={onInk} />
        </span>
      )}

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={onInk ? 'ghostReversed' : 'ghost'}
              size="sm"
              style={{ height: 44, width: 44 }}
              className="p-0"
              aria-label={t('header.openUserMenu', 'Open user menu')}
            >
              <Avatar style={{ height: 36, width: 36 }}>
                {/* The trigger already carries an `aria-label`, so this alt is
                    belt-and-braces — but it was hardcoded English in an
                    11-locale product. */}
                <AvatarImage
                  src={avatarSrc}
                  alt={displayName || t('header.userMenu.yourAccount', 'Your account')}
                />
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
                <IdentityRow
                  avatarSrc={avatarSrc}
                  avatarInitial={avatarInitial}
                  username={username}
                  email={user.email ?? null}
                  fallbackLabel={t('header.userMenu.you', 'You')}
                  avatarPx={36}
                />
              </LocalizedLink>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <LocalizedLink to={`/user/${user.id}`} className="flex gap-2 no-underline">
                <UserRound size={16} />
                <span>{t('header.userMenu.viewProfile', 'View public profile')}</span>
              </LocalizedLink>
            </DropdownMenuItem>

            {/* No theme switch in THIS menu — it lives in the footer and the
                mobile nav sheet instead, which is where the other display
                controls (language, currency) are.

                This comment used to claim dark mode had been "dropped with the
                subway-map rebrand". That was false and stale: `src/index.css`
                carries a full `.dark` token block, `ThemeProvider` applies the
                class, `ThemeToggle` ships in Footer and MobileNavSheet, and it
                offers Light/Dark/System. Dark mode is supported — a token needs
                a value in both blocks. */}

            <DropdownMenuItem asChild>
              <LocalizedLink to="/hub/friends" className="flex gap-2 no-underline">
                <Users size={16} />
                <span>{t('header.userMenu.friends', 'Friends')}</span>
                <FriendsOnlineCount count={friendsOnline} />
              </LocalizedLink>
            </DropdownMenuItem>

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
        // The 1.00-contrast case. `ghost` is `text-foreground`, so on the
        // compact ink plate this button's label was ink on ink — measured
        // invisible on prod for every signed-out desktop visitor past the
        // scroll threshold.
        <Button
          variant={onInk ? 'ghostReversed' : 'ghost'}
          size="sm"
          onClick={() => setAuthDialogOpen(true)}
          aria-label={t('header.signIn', 'Sign in')}
        >
          {t('header.signIn', 'Sign in')}
        </Button>
      )}
    </div>
  );

  // ── Desktop primary nav — the Intent Router as a compact track row.
  // Single-sourced from INTENT_NAV in src/config/navigation.ts. This array used
  // to be hardcoded here and had silently diverged from the config's
  // PRIMARY_NAV, leaving /venues (the largest catalog) and /people unreachable
  // from desktop chrome. Never re-inline it.
  //
  // Navigation is text-only at every desktop width. Keep every label visible
  // and let the row scroll when space is tight rather than replacing it with
  // a small illustration.
  const renderDesktopNav = (onInk: boolean) => (
    // Distinct landmark name — the mobile bottom bar owns "Navigation";
    // duplicate nav landmark names break rotor navigation (landmark-unique).
    // `md:` not `lg:` — useIsMobile flips at md (768) and MobileBottomNav is
    // md:hidden, so `hidden lg:flex` left 768–1023px with no primary nav.
    <nav
      aria-label={t('header.primaryNavigation', 'Primary')}
      className="no-scrollbar hidden h-12 min-w-0 items-center overflow-x-auto md:flex"
    >
      {INTENT_NAV.map((intent) => {
        const { to, labelKey, fallback, id } = intent;
        const active = isIntentActive(intent, path);
        const label = t(labelKey, fallback);
        const track = INTENT_TRACK[id] ?? 'pink';
        return (
          <LocalizedLink
            key={to}
            to={to}
            title={label}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative grid h-11 min-w-11 shrink-0 place-items-center rounded-container px-2 no-underline transition-colors',
              active
                ? onInk
                  ? 'text-background'
                  : 'text-foreground'
                : // The inactive hover is surface-dependent: `bg-surface-container`
                  // + `text-foreground` is a paper hover, which on the ink plate
                  // would be a paper tile with ink type sitting in an ink bar.
                  onInk
                  ? 'text-background/70 hover:bg-background/15 hover:text-background'
                  : 'text-muted-foreground hover:bg-surface-container hover:text-foreground',
            )}
          >
            <span className="whitespace-nowrap text-13 font-bold">{label}</span>
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-2 bottom-0 h-1 rounded-full',
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
  //
  // DELIBERATE OVERRIDE of that last sentence, 2026-10-10. The nav survives
  // the collapse now, and the reason is a measurement rather than a taste
  // disagreement: `useCompactHeader` LATCHES, so once a reader is 80px down a
  // page the collapsed bar is the only chrome they have — and it carried no
  // `<nav>` at all. Measured on prod, `header nav[aria-label="Primary"]`
  // returned ZERO links at 1100px and at 1440px, and because the latch's reset
  // arm fires only inside a scroll event it stayed at zero even back at
  // `scrollY: 0`. A fresh navigation that restores scroll (measured: /travel
  // landing at 252px) put the bar in that state from first paint.
  //
  // That is the same OUTCOME routes.tsx documents as a fixed production bug —
  // "/venues and /people unreachable from desktop chrome on every fresh load"
  // — reached by a different mechanism, so it is a regression of a known class
  // and not a cosmetic complaint about the spec.
  //
  // The collapse itself is kept: one ink line, same height, same box. The tabs
  // are already 40→44px icon-only below `xl`, so they cost 308px and fit — at
  // 768px the row is ~617px of content in a 704px box. What is DROPPED is the
  // TrackSwatch + icon + label chip that used to stand in for the nav: the
  // active tab's own 4px track rule carries the line and the job already, so
  // the chip became a second statement of the same two signals.
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
        'site-header island island-capped sticky',
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
            // `flex-nowrap` + `min-w-0` on the nav, NOT `flex-wrap`. The wrap
            // was load-bearing in the wrong direction: a wrapped row grows
            // past 60px while `--header-pinned-h` stays 60, which silently
            // re-introduces the sticky-bar overlap index.css documents as a
            // fixed production bug (header bottom 82 vs bar top 64 at 1440).
            // Nothing in this row may push the bar taller than its token.
            //
            // NO `py-2`, and that is the same rule biting its own author. The
            // tab row is `h-12` (48px), so 48 + 16 of padding made the bar
            // **64px against a 60px token** — measured on prod at 768px the
            // moment this change deployed, by the guard written for exactly
            // this risk (`the bar never grows past its own pinned-height
            // token`). The padding was redundant anyway: `minHeight` is the
            // token and `items-center` does the centring, so the 48px nav and
            // the 44px controls sit inside 60px with room to spare.
            'mx-auto flex w-full max-w-page flex-nowrap items-center gap-4',
            PAGE_GUTTER,
          )}
          style={{ minHeight: 'var(--header-pinned-h)' }}
        >
          {/* `flex items-center`, not a bare block: the wordmark span is an
              inline-block, so a block link boxes it against the line's strut
              and Anton's own metrics leave the ink hanging at the TOP of a
              44px box. Measured on prod at 1440: 12px above the mark, 27px
              below it, in a bar whose every other item is centred. Making the
              link a flex row centres the span box itself — 20/19. */}
          <Link to="/" className="flex shrink-0 items-center no-underline" aria-label={siteName}>
            <Wordmark className="text-title text-background" />
          </Link>
          {/* The real tab row, not a chip standing in for it. See the override
              note above the `return` for why the spec's "nothing else survives
              the collapse" is deviated from here. */}
          <div className="min-w-0 flex-1 overflow-hidden">{renderDesktopNav(true)}</div>
          <span className="flex shrink-0 items-center gap-2">{renderRightCluster(true)}</span>
        </div>
      ) : (
        <>
          {/* ── 01 · Primary. One navigation plane; search expands into its
               command plate only when asked for. ───────────────────────── */}
          <div className={cn('mx-auto w-full max-w-page', PAGE_GUTTER)}>
            {/* `minHeight: var(--header-pinned-h)`, not a literal. The two
                literals that used to live here (52 mobile / 60 desktop)
                restated the token that defines them (index.css declares 52,
                overridden to 60 at md) — the two-sources-for-one-number
                pattern PageContainer's STICKY_UNDER_HEADER comment exists to
                end. `minHeight` rather than `height` so the row grows instead
                of clipping its 44px controls at 150–200% text zoom. */}
            {isMobile ? (
              <div
                className="flex items-center gap-2"
                style={{ minHeight: 'var(--header-pinned-h)' }}
              >
                {brand}
                {/* `collapse`: below `sm` the search is the mock's ICON, not a
                    field (panel 06 — brand, search icon, avatar). A field
                    cannot share a 320px row with the wordmark and the action
                    cluster; it measured 14.7px wide and the axe sweep returned
                    43 serious `target-size` failures on it. */}
                <div className="mx-2 flex min-w-0 flex-1 justify-end sm:justify-stretch">
                  <UniversalSearchBar collapse />
                </div>
              </div>
            ) : (
              <div
                className="flex items-center gap-2"
                style={{ minHeight: 'var(--header-pinned-h)' }}
              >
                <div className="flex shrink-0 items-center gap-2.5">{brand}</div>
                <div className="min-w-0 flex-1 overflow-hidden">{renderDesktopNav(false)}</div>
                <UniversalSearchBar iconOnly />
                <div className="shrink-0">{renderRightCluster(false)}</div>
              </div>
            )}
          </div>
        </>
      )}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}
