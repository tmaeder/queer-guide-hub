import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { LogOut, Shield, UserRound } from 'lucide-react';
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
import {
  USER_MENU_ITEMS as userMenuItems,
  INTENT_NAV,
  INTENT_TRACK,
  isIntentActive,
} from '@/config/navigation';
import { getSubmitCta } from '@/lib/submitCta';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import { Wordmark } from '@/components/brand/Wordmark';
import { MasterSymbol } from '@/components/brand/MasterSymbol';
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
        // Spec row 1: the mark and the wordmark travel together.
        //
        // The wordmark steps DOWN on small screens and is dropped entirely
        // below `sm`. Anton at --text-headline measures 142px, and on a 320px
        // viewport that left the search field 32px wide — unusable, and 94
        // `target-size` violations in the axe route sweep, which scans down to
        // 320px. The mark alone carries the brand at that width.
        <>
          <MasterSymbol className="w-10 shrink-0 text-foreground sm:w-12" />
          <Wordmark className="hidden text-title text-foreground sm:inline-block md:text-headline" />
        </>
      )}
    </Link>
  );

  const rightCluster = (
    <div className="flex items-center gap-1 flex-shrink-0">
      {user ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(submitCta.route)}
          aria-label={submitCta.label}
          title={submitCta.label}
          style={{ height: 40, width: 40, padding: 0 }}
        >
          <TransitIcon name="add-station" size={20} />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAuthDialogOpen(true)}
          aria-label={t('header.signInToContribute', 'Sign in to contribute')}
          title={t('header.signInToContribute', 'Sign in to contribute')}
          style={{ height: 40, width: 40, padding: 0 }}
        >
          <TransitIcon name="add-station" size={20} />
        </Button>
      )}

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

  // ── Desktop primary nav — the Intent Router row.
  // Single-sourced from INTENT_NAV in src/config/navigation.ts. This array used
  // to be hardcoded here and had silently diverged from the config's
  // PRIMARY_NAV, leaving /venues (the largest catalog) and /people unreachable
  // from desktop chrome. Never re-inline it.
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
        const { to, labelKey, fallback, id } = intent;
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
            <span className="whitespace-nowrap px-4 pb-2 pt-4 text-15 font-bold lg:px-6">
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
  const trackSwatch = {
    pink: 'bg-track-pink',
    blue: 'bg-track-blue',
    green: 'bg-track-green',
    yellow: 'bg-track-yellow',
  }[activeTrack];

  return (
    <header
      // The whole bar is one 4px-ruled box (spec panel 01), not a hairline
      // edge. No backdrop blur: the compact state is a solid ink flood, and a
      // blurred translucent bar under it reads as a third, muddier surface.
      className={cn(
        'sticky top-0 border-b-4 border-foreground',
        compact && !isMobile ? 'bg-foreground text-background' : 'bg-background',
      )}
      style={{ zIndex: 1100, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {compact && !isMobile ? (
        /* ── 02 · Compact, after scroll — one ink line ────────────────── */
        <div
          className={cn(
            'mx-auto flex w-full max-w-page flex-wrap items-center gap-4 py-2',
            PAGE_GUTTER,
          )}
        >
          <Link to="/" className="no-underline" aria-label={siteName}>
            <Wordmark className="text-title text-background" />
          </Link>
          {activeIntent && (
            <span className="flex items-center gap-2 text-15 font-bold">
              <span aria-hidden className={cn('h-2 w-5 rounded-full', trackSwatch)} />
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
                <div className="mx-2 min-w-0 flex-1">
                  <UniversalSearchBar />
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
            <div className="border-t-[3px] border-foreground">
              <div className={cn('mx-auto flex w-full max-w-page items-stretch', PAGE_GUTTER)}>
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
