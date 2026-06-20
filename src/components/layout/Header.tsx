import { useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { LogOut, Plus, Shield, UserRound } from 'lucide-react';
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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { generateAvatarUrl } from '@/lib/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { USER_MENU_ITEMS as userMenuItems } from '@/config/navigation';

// ── Component ───────────────────────────────────────────────────────────────

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isAdmin, isModerator } = useAdminRoles();

  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);

  const getSubmitCta = useCallback(() => {
    if (location.pathname.startsWith('/events'))
      return { label: t('header.submitEvent', 'Submit Event'), route: '/submit/event' };
    if (location.pathname.startsWith('/venues'))
      return { label: t('header.submitVenue', 'Submit Venue'), route: '/submit/venue' };
    if (location.pathname.startsWith('/marketplace'))
      return { label: t('header.submitProduct', 'Submit Product'), route: '/submit/product' };
    if (location.pathname.startsWith('/hotels'))
      return { label: t('header.submitHotel', 'Submit Hotel'), route: '/submit/hotel' };
    return { label: t('header.contribute', 'Contribute'), route: '/submit' };
  }, [location.pathname, t]);
  const submitCta = getSubmitCta();

  const displayName = (profile?.display_name as string | null) || null;
  const username = (profile?.username as string | null) || null;
  const avatarInitial = (displayName || user?.email || 'U').charAt(0).toUpperCase();

  // ── Render ──────────────────────────────────────────────────────────────

  // ── Brand + right action cluster (shared by mobile row & desktop grid) ───
  const brand = (
    <Link to="/" aria-label="Queer Guide" className="flex items-center gap-2.5 shrink-0 no-underline">
      <img
        src="/images/logo.png"
        alt=""
        aria-hidden="true"
        tabIndex={-1}
        className="brightness-0 dark:invert transition-transform duration-150 hover:-rotate-6 hover:scale-110 active:scale-95"
        style={{ height: 34, width: 34 }}
      />
      <span className="hidden flex-col font-display text-base font-bold leading-[1.1] tracking-tight text-foreground md:flex">
        <span>Queer</span>
        <span>Guide</span>
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
            {/* Identity — leads the menu, links to the private /me hub */}
            <DropdownMenuLabel className="p-0 font-normal">
              <LocalizedLink
                to="/me"
                className="flex items-center gap-2 rounded-element p-2 no-underline"
              >
                <Avatar style={{ height: 36, width: 36 }}>
                  <AvatarImage src={avatarSrc} alt="" />
                  <AvatarFallback>{avatarInitial}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {displayName || t('header.userMenu.you', 'You')}
                  </span>
                  {username ? (
                    <span className="truncate font-mono text-2xs text-muted-foreground">
                      @{username}
                    </span>
                  ) : user.email ? (
                    <span className="truncate text-2xs text-muted-foreground">{user.email}</span>
                  ) : null}
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
          /* ── Desktop: brand left · centered search hero · actions right ── */
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4" style={{ height: 64 }}>
            <div className="justify-self-start">{brand}</div>
            <div
              className="min-w-0 justify-self-center"
              style={{ width: 'clamp(320px, 40vw, 672px)' }}
            >
              <UniversalSearchBar />
            </div>
            <div className="justify-self-end">{rightCluster}</div>
          </div>
        )}
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}
