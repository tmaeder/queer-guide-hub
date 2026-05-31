import { useState, useCallback, Suspense, lazy } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LogOut, Plus, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { generateAvatarUrl } from '@/lib/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNotifications } from '@/hooks/useNotifications';
const NotificationList = lazy(() =>
  import('@/components/notifications/NotificationList').then((m) => ({
    default: m.NotificationList,
  })),
);
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import {
  USER_MENU_ITEMS as userMenuItems,
  USER_MODES as userModes,
} from '@/config/navigation';
import { QuickLaunchNav } from '@/components/layout/QuickLaunchNav';

// ── Component ───────────────────────────────────────────────────────────────

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { unreadCount } = useNotifications();
  const { isAdmin, isModerator } = useAdminRoles();
  const inboxBadgeCount = useInboxBadge();

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

  const handleModeChange = async (mode: string) => {
    await updateProfile({
      user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community',
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <header
      className="sticky top-0 border-b border-border bg-background/80 backdrop-blur-xl"
      style={{ zIndex: 1100, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-2 sm:gap-4" style={{ height: isMobile ? 56 : 64 }}>
          {/* ── Logo ──────────────────────────────────────────────────── */}
          <Link to="/" style={{ alignItems: 'center' }} className="flex gap-2 shrink-0 no-underline">
            <img
              src="/images/logo.png"
              alt=""
              aria-hidden="true"
              tabIndex={-1}
              className="brightness-0 dark:invert transition-transform duration-150 hover:-rotate-6 hover:scale-110 active:scale-95"
              style={{ height: 28, width: 28 }}
            />
            <span className="sr-only">Queer Guide</span>
          </Link>

          {/* ── Row 1: search · [+] · avatar ──────────────────────────── */}
          <div className="flex-1 min-w-0 mx-2 sm:mx-4 md:mx-8">
            <UniversalSearchBar />
          </div>

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

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ height: 40, width: 40 }}
                    className="relative p-0"
                    aria-label={t('header.openUserMenu', 'Open user menu')}
                  >
                    <Avatar style={{ height: 36, width: 36 }}>
                      <AvatarImage
                        src={avatarSrc}
                        alt={(profile?.display_name || 'Your account') as string}
                      />
                      <AvatarFallback>
                        {(profile?.display_name || 'U')?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {unreadCount > 0 && (
                      <span
                        className="absolute inline-flex items-center justify-center bg-destructive text-destructive-foreground pl-1 pr-1"
                        style={{
                          top: -4,
                          right: -4,
                          minWidth: '1.25rem',
                          height: 20,
                          fontSize: '10px',
                        }}
                      >
                        <span className="absolute inset-0 animate-ping bg-destructive opacity-75" />
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" style={{ width: 320, zIndex: 50 }} className="p-4">
                  <div className="mb-4">
                    <Select value={profile?.user_mode || 'community'} onValueChange={handleModeChange}>
                      <SelectTrigger style={{ width: '100%' }}>
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {userModes.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            <div className="flex items-center gap-2">
                              <mode.icon style={{ width: 16, height: 16 }} />
                              <span>{t(mode.labelKey)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="mb-4">
                    <Suspense fallback={null}>
                      <NotificationList />
                    </Suspense>
                  </div>

                  <div className="my-2" />

                  {userMenuItems.map((item) => {
                    const showBadge = item.to === '/trips' && inboxBadgeCount > 0;
                    return (
                      <Button
                        key={item.to}
                        variant="ghost"
                        size="sm"
                        style={{
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          width: '100%',
                          padding: '8px 12px',
                        }}
                        className="flex gap-2"
                        onClick={() => navigate(item.to)}
                      >
                        <item.icon style={{ width: 16, height: 16 }} />
                        <span className="text-sm flex-1 text-left">{t(item.labelKey)}</span>
                        {showBadge && (
                          <Badge variant="default" className="h-5" style={{ fontSize: '0.7rem' }}>
                            {inboxBadgeCount}
                          </Badge>
                        )}
                      </Button>
                    );
                  })}

                  {(isAdmin || isModerator) && (
                    <>
                      <div className="my-2" />
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          width: '100%',
                          padding: '8px 12px',
                        }}
                        className="flex gap-2"
                        onClick={() => navigate('/admin')}
                      >
                        <Shield size={16} />
                        <span className="text-sm">{t('header.adminConsole', 'Admin Console')}</span>
                      </Button>
                    </>
                  )}

                  <div className="my-2" />

                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                    className="text-destructive"
                    onClick={signOut}
                  >
                    <LogOut size={16} className="mr-2" />
                    {t('header.signOut', 'Sign Out')}
                  </Button>
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
        </div>

        {/* ── Desktop row 2: quick-launch nav ─────────────────────────── */}
        {!isMobile && <QuickLaunchNav />}
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}
