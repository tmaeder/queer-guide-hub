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
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  Heart,
  Menu,
  User,
  MapPin,
  Calendar,
  Store,
  Globe,
  Plane,
  Newspaper,
  Settings,
  Users,
  LogOut,
  Accessibility,
  Tags,
  UserCheck,
  Map,
  Smile,
  Handshake,
  Home,
  UsersRound,
  Rss,
  Plus,
  Shield,
  Info,
  Scale,
  Mail,
  Building,
  Luggage,
  LifeBuoy,
  Puzzle,
  Footprints,
  Search as SearchIcon,
  X,
  ChevronDown,
} from 'lucide-react';
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

// ── Data ────────────────────────────────────────────────────────────────────

const primaryNav = [
  { to: '/venues', icon: MapPin, labelKey: 'header.nav.venues' },
  { to: '/events', icon: Calendar, labelKey: 'header.nav.events' },
  { to: '/places', icon: Globe, labelKey: 'header.nav.places' },
  { to: '/marketplace', icon: Store, labelKey: 'header.nav.marketplace' },
  { to: '/news', icon: Newspaper, labelKey: 'header.nav.news' },
];

const moreNav = [
  { to: '/map', icon: Map, labelKey: 'header.nav.map' },
  { to: '/feed', icon: Rss, labelKey: 'header.nav.feed' },
  { to: '/groups', icon: UsersRound, labelKey: 'header.nav.groups' },
  { to: '/users', icon: UserCheck, labelKey: 'header.nav.members' },
  { to: '/resources', icon: Tags, labelKey: 'header.nav.resources' },
  { to: '/travel', icon: Plane, labelKey: 'header.nav.travel' },
  { to: '/personalities', icon: Users, labelKey: 'header.nav.personalities' },
  { to: '/hotels', icon: Building, labelKey: 'header.nav.hotels' },
  { to: '/help', icon: LifeBuoy, labelKey: 'header.nav.help' },
];

const userMenuItems = [
  { to: '/trips', icon: Luggage, labelKey: 'header.userMenu.myTrips' },
  { to: '/favorites', icon: Heart, labelKey: 'header.userMenu.favorites' },
  { to: '/profile/footprint', icon: Footprints, labelKey: 'header.userMenu.footprint' },
  { to: '/profile/settings', icon: Settings, labelKey: 'header.userMenu.settings' },
  { to: '/inbox', icon: Mail, labelKey: 'header.userMenu.inbox' },
  { to: '/friends', icon: Users, labelKey: 'header.userMenu.friends' },
  { to: '/my-groups', icon: UsersRound, labelKey: 'header.userMenu.myGroups' },
  { to: '/extension', icon: Puzzle, labelKey: 'header.userMenu.extension' },
];

const userModes = [
  { value: 'dating', icon: Heart, labelKey: 'header.modes.dating' },
  { value: 'friends', icon: Users, labelKey: 'header.modes.friends' },
  { value: 'exploration', icon: Map, labelKey: 'header.modes.exploration' },
  { value: 'fun', icon: Smile, labelKey: 'header.modes.fun' },
  { value: 'networking', icon: Handshake, labelKey: 'header.modes.networking' },
  { value: 'community', icon: Home, labelKey: 'header.modes.community' },
];

const legalItems = [
  { to: '/about', icon: Info, labelKey: 'header.legal.about' },
  { to: '/help', icon: LifeBuoy, labelKey: 'header.legal.help' },
  { to: '/accessibility', icon: Accessibility, labelKey: 'header.legal.accessibility' },
  { to: '/legal', icon: Scale, labelKey: 'header.legal.legal' },
  { to: '/contact', icon: Mail, labelKey: 'header.legal.contact' },
];

// ── Component ───────────────────────────────────────────────────────────────

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
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

  const isActiveRoute = useCallback(
    (path: string) => {
      if (path === '/') return location.pathname === '/';
      return location.pathname.startsWith(path);
    },
    [location.pathname],
  );

  const moreActive = moreNav.some((item) => isActiveRoute(item.to));

  const handleModeChange = async (mode: string) => {
    await updateProfile({
      user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community',
    });
  };

  const handleDrawerNav = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const handleMoreNav = (path: string) => {
    navigate(path);
    setMoreOpen(false);
  };

  // ── Mobile Drawer ───────────────────────────────────────────────────────

  const mobileDrawer = (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="right"
        id="mobile-nav-drawer"
        aria-label={t('header.navigation', 'Navigation')}
        className="w-full sm:w-80 p-0 flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <Link
            to="/"
            onClick={() => setDrawerOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
          >
            <img
              src="/images/logo.png"
              alt="Queer Guide"
              className="h-7 w-7 brightness-0 dark:invert"
            />
            <span className="text-base font-bold text-foreground">Queer Guide</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {user && (
            <>
              <div className="px-4 py-3">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar style={{ height: 40, width: 40 }}>
                    <AvatarImage
                      src={avatarSrc}
                      alt={(profile?.display_name || 'Account') as string}
                    />
                    <AvatarFallback>
                      {(profile?.display_name || 'U')?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                      {profile?.display_name || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap block">
                      {user.email}
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <div
                      className="flex items-center justify-center px-1 flex-shrink-0 bg-destructive text-destructive-foreground font-bold"
                      style={{ minWidth: 22, height: 22, fontSize: '0.7rem' }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                  )}
                </div>

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
              <div className="my-2" />
            </>
          )}

          {!user && (
            <>
              <div className="px-4 py-4 flex flex-col gap-2">
                <Button
                  variant="default"
                  size="sm"
                  style={{ width: '100%', fontWeight: 600, height: 44 }}
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate('/auth?mode=signup');
                  }}
                >
                  {t('header.signUp', 'Sign Up')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  style={{ width: '100%', fontWeight: 600, height: 44 }}
                  onClick={() => {
                    setDrawerOpen(false);
                    setAuthDialogOpen(true);
                  }}
                >
                  <User style={{ width: 16, height: 16, marginRight: 8 }} />
                  {t('header.signIn', 'Sign In')}
                </Button>
              </div>
              <div className="my-2" />
            </>
          )}

          <div className="px-4 py-3">
            <Button
              variant="default"
              size="sm"
              style={{
                width: '100%',
                fontWeight: 600,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={() => handleDrawerNav(submitCta.route)}
            >
              <Plus style={{ width: 18, height: 18 }} />
              {submitCta.label}
            </Button>
          </div>

          {[...primaryNav, ...moreNav].map((item) => {
            const active = isActiveRoute(item.to);
            return (
              <button
                key={item.to}
                onClick={() => handleDrawerNav(item.to)}
                className={`w-full flex items-center gap-2 px-4 text-left ${active ? 'bg-muted' : 'hover:bg-muted'}`}
                style={{ minHeight: 48 }}
              >
                <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span className={`text-sm ${active ? 'font-semibold' : 'font-normal'}`}>
                  {t(item.labelKey)}
                </span>
              </button>
            );
          })}

          <div className="my-2" />

          {user && (
            <>
              {userMenuItems.map((item) => {
                const showBadge = item.to === '/trips' && inboxBadgeCount > 0;
                return (
                  <button
                    key={item.to}
                    onClick={() => handleDrawerNav(item.to)}
                    className="w-full flex items-center gap-2 px-4 hover:bg-muted text-left"
                    style={{ minHeight: 48 }}
                  >
                    <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                    <span className="text-sm flex-1">{t(item.labelKey)}</span>
                    {showBadge && (
                      <Badge variant="default" className="h-5" style={{ fontSize: '0.7rem' }}>
                        {inboxBadgeCount}
                      </Badge>
                    )}
                  </button>
                );
              })}

              {(isAdmin || isModerator) && (
                <button
                  onClick={() => handleDrawerNav('/admin')}
                  className="w-full flex items-center gap-2 px-4 hover:bg-muted text-left"
                  style={{ minHeight: 48 }}
                >
                  <Shield style={{ width: 18, height: 18, flexShrink: 0 }} />
                  <span className="text-sm">{t('header.adminConsole', 'Admin Console')}</span>
                </button>
              )}

              <div className="my-2" />
            </>
          )}

          {legalItems.map((item) => (
            <button
              key={item.to}
              onClick={() => handleDrawerNav(item.to)}
              className="w-full flex items-center gap-2 px-4 hover:bg-muted text-left"
              style={{ minHeight: 44 }}
            >
              <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span className="text-sm">{t(item.labelKey)}</span>
            </button>
          ))}

          {user && (
            <>
              <div className="my-2" />
              <button
                onClick={() => {
                  signOut();
                  setDrawerOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 hover:bg-muted text-left text-destructive"
                style={{ minHeight: 48 }}
              >
                <LogOut style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span className="text-sm font-medium">{t('header.signOut', 'Sign Out')}</span>
              </button>
            </>
          )}

          <div style={{ height: 'env(safe-area-inset-bottom, 16px)', minHeight: 16 }} />
        </div>
      </SheetContent>
    </Sheet>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <header
      className="sticky top-0 bg-background/70 backdrop-blur-xl border-b border-border/50"
      style={{ zIndex: 1100, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-2 sm:gap-3" style={{ height: isMobile ? 56 : 64 }}>
          {/* ── Logo ──────────────────────────────────────────────────── */}
          {!(isMobile && mobileSearchOpen) && (
            <Link
              to="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
                textDecoration: 'none',
              }}
            >
              <img
                src="/images/logo.png"
                alt=""
                aria-hidden="true"
                tabIndex={-1}
                className="brightness-0 dark:invert transition-transform duration-150 hover:-rotate-6 hover:scale-110 active:scale-95"
                style={{ height: 28, width: 28 }}
              />
              <span
                className="absolute"
                style={{ width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
              >
                Queer Guide
              </span>
            </Link>
          )}

          {isMobile ? (
            /* ── MOBILE: logo · search-icon · hamburger (or expanded search) ── */
            mobileSearchOpen ? (
              <>
                <div className="flex-1 min-w-0">
                  <UniversalSearchBar />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileSearchOpen(false)}
                  aria-label={t('header.closeSearch', 'Close search')}
                  className="text-foreground flex-shrink-0 p-0"
                  style={{ width: 48, height: 48 }}
                >
                  <X style={{ width: 22, height: 22 }} />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileSearchOpen(true)}
                  aria-label={t('header.openSearch', 'Open search')}
                  className="text-foreground flex-shrink-0 p-0"
                  style={{ width: 48, height: 48 }}
                >
                  <SearchIcon style={{ width: 22, height: 22 }} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDrawerOpen(true)}
                  aria-label={t('header.openMenu', 'Open menu')}
                  aria-haspopup="dialog"
                  aria-expanded={drawerOpen}
                  aria-controls="mobile-nav-drawer"
                  className="text-foreground relative flex-shrink-0 p-0"
                  style={{ width: 48, height: 48 }}
                >
                  <Menu style={{ width: 22, height: 22 }} />
                  {user && unreadCount > 0 && (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute bg-destructive"
                        style={{ top: 8, right: 8, width: 8, height: 8 }}
                      />
                      <span
                        role="status"
                        aria-live="polite"
                        className="absolute"
                        style={{
                          width: 1,
                          height: 1,
                          overflow: 'hidden',
                          clip: 'rect(0,0,0,0)',
                        }}
                      >
                        {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </Button>
              </>
            )
          ) : (
            /* ── DESKTOP row 1: logo · BIG search · [+] · avatar ── */
            <>
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
                    <Plus style={{ width: 20, height: 20 }} />
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
                    <Plus style={{ width: 20, height: 20 }} />
                  </Button>
                )}

                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ position: 'relative', height: 40, width: 40, padding: 0 }}
                        aria-label={t('header.openUserMenu', 'Open user menu')}
                      >
                        <Avatar style={{ height: 36, width: 36 }}>
                          <AvatarImage
                            src={avatarSrc}
                            alt={(profile?.display_name || 'Account menu') as string}
                          />
                          <AvatarFallback>
                            {(profile?.display_name || 'U')?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {unreadCount > 0 && (
                          <span
                            className="absolute inline-flex items-center justify-center bg-destructive text-destructive-foreground"
                            style={{
                              top: -4,
                              right: -4,
                              minWidth: '1.25rem',
                              height: 20,
                              fontSize: '10px',
                              paddingLeft: 4,
                              paddingRight: 4,
                            }}
                          >
                            <span className="absolute inset-0 animate-ping bg-destructive opacity-75" />
                            {unreadCount}
                          </span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" style={{ width: 320, padding: 16, zIndex: 50 }}>
                      <div className="mb-4">
                        <Select
                          value={profile?.user_mode || 'community'}
                          onValueChange={handleModeChange}
                        >
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
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              width: '100%',
                              gap: 8,
                              padding: '8px 12px',
                            }}
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
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              width: '100%',
                              gap: 8,
                              padding: '8px 12px',
                            }}
                            onClick={() => navigate('/admin')}
                          >
                            <Shield style={{ width: 16, height: 16 }} />
                            <span className="text-sm">
                              {t('header.adminConsole', 'Admin Console')}
                            </span>
                          </Button>
                        </>
                      )}

                      <div className="my-2" />

                      <Button
                        variant="ghost"
                        size="sm"
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          color: 'hsl(var(--destructive))',
                        }}
                        onClick={signOut}
                      >
                        <LogOut style={{ width: 16, height: 16, marginRight: 8 }} />
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
            </>
          )}
        </div>

        {/* ── DESKTOP row 2: tab nav ──────────────────────────────────── */}
        {!isMobile && (
          <nav
            className="flex items-center gap-6"
            style={{ height: 36 }}
            aria-label={t('header.primaryNav', 'Primary')}
          >
            {primaryNav.map((item) => {
              const active = isActiveRoute(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`text-sm transition-colors py-2 ${
                    active
                      ? 'font-semibold text-foreground underline underline-offset-8 decoration-2'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  style={{ textDecoration: active ? 'underline' : 'none' }}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}

            <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className={`text-sm py-2 inline-flex items-center gap-1 transition-colors ${
                    moreActive
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  {t('header.nav.more', 'More')}
                  <ChevronDown style={{ width: 14, height: 14 }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" style={{ width: 220, padding: 4, zIndex: 50 }}>
                {moreNav.map((item) => {
                  const active = isActiveRoute(item.to);
                  return (
                    <button
                      key={item.to}
                      onClick={() => handleMoreNav(item.to)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                        active ? 'bg-muted font-semibold' : 'hover:bg-muted'
                      }`}
                    >
                      <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                      <span>{t(item.labelKey)}</span>
                    </button>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        )}
      </div>

      {isMobile && mobileDrawer}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}
