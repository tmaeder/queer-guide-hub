import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { LogOut, Moon, Plus, Shield, Sun, UserRound } from 'lucide-react';
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
import { USER_MENU_ITEMS as userMenuItems } from '@/config/navigation';
import { getSubmitCta } from '@/lib/submitCta';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useSiteBranding } from '@/hooks/useSiteBranding';

// ── Component ───────────────────────────────────────────────────────────────

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const { profile } = useProfile();
  const { isAdmin, isModerator } = useAdminRoles();

  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);

  const submitCta = getSubmitCta(location.pathname, t);

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
      className="flex items-center gap-2.5 shrink-0 no-underline"
    >
      <img
        src={branding.logoUrl ?? '/images/logo.png'}
        alt=""
        aria-hidden="true"
        tabIndex={-1}
        className={`${branding.logoUrl ? '' : 'brightness-0 dark:invert '}transition-transform duration-150 hover:-rotate-6 hover:scale-110 active:scale-95 object-contain`}
        style={{ height: 34, width: 34 }}
      />
      <span className="hidden flex-col font-display text-base font-bold leading-[1.1] tracking-tight text-foreground md:flex">
        <span>{wordmarkTop}</span>
        {wordmarkBottom && <span>{wordmarkBottom}</span>}
      </span>
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
          <Plus size={20} />
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
          <Plus size={20} />
        </Button>
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

            {/* Light/dark switch — sits directly above Settings. onSelect
                preventDefault keeps the menu open so it reads as a toggle. */}
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setTheme(isDark ? 'light' : 'dark');
              }}
              className="flex gap-2"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              <span>
                {isDark
                  ? t('header.userMenu.lightMode', 'Light mode')
                  : t('header.userMenu.darkMode', 'Dark mode')}
              </span>
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

  // ── Desktop primary nav — mirrors the mobile Explore IA. Mobile keeps the
  // bottom tab bar; desktop finally gets browse paths beyond the search box.
  const path = stripLocale(location.pathname);
  const primaryNav = [
    { to: '/map', labelKey: 'header.nav.map', fallback: 'Map' },
    { to: '/places', labelKey: 'header.nav.places', fallback: 'Places' },
    { to: '/events', labelKey: 'header.nav.events', fallback: 'Events' },
    { to: '/marketplace', labelKey: 'header.nav.marketplace', fallback: 'Marketplace' },
    { to: '/news', labelKey: 'header.nav.news', fallback: 'News' },
  ] as const;
  const desktopNav = (
    // Distinct landmark name — the mobile bottom bar owns "Navigation";
    // duplicate nav landmark names break rotor navigation (landmark-unique).
    <nav aria-label={t('header.primaryNavigation', 'Primary')} className="hidden lg:flex items-center gap-1">
      {primaryNav.map(({ to, labelKey, fallback }) => {
        const active = path === to || path.startsWith(`${to}/`);
        return (
          <LocalizedLink
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'px-2 py-2 text-sm font-semibold text-foreground underline decoration-2 underline-offset-8'
                : 'px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground no-underline'
            }
          >
            {t(labelKey, fallback)}
          </LocalizedLink>
        );
      })}
    </nav>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <header
      className="sticky top-0 border-b border-border bg-background/80 backdrop-blur-xl"
      style={{ zIndex: 1100, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="px-4 sm:px-6 md:px-8">
        {isMobile ? (
          /* ── Mobile: brand · search · actions ── */
          <div className="flex items-center gap-2 sm:gap-4" style={{ height: 56 }}>
            {brand}
            <div className="flex-1 min-w-0 mx-2 sm:mx-4">
              <UniversalSearchBar />
            </div>
            {rightCluster}
          </div>
        ) : (
          /* ── Desktop: brand + nav left · search center · actions right ── */
          <div className="flex items-center gap-4" style={{ height: 64 }}>
            <div className="flex items-center gap-6 shrink-0">
              {brand}
              {desktopNav}
            </div>
            <div className="min-w-0 flex-1 flex justify-center">
              <div className="w-full" style={{ maxWidth: 'clamp(280px, 36vw, 672px)' }}>
                <UniversalSearchBar />
              </div>
            </div>
            <div className="shrink-0">{rightCluster}</div>
          </div>
        )}
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}
