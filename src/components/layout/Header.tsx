import { useState, useCallback } from 'react';
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
  X,
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
import { NotificationList } from '@/components/notifications/NotificationList';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { motion } from 'motion/react';

// ── Data ────────────────────────────────────────────────────────────────────

const navigationSections = [
  {
    titleKey: 'header.nav.discover',
    items: [
      { to: '/venues', icon: MapPin, labelKey: 'header.nav.venues', cat: 'venues' },
      { to: '/events', icon: Calendar, labelKey: 'header.nav.events', cat: 'events' },
      { to: '/places', icon: Globe, labelKey: 'header.nav.places', cat: 'places' },
      { to: '/map', icon: Map, labelKey: 'header.nav.map', cat: 'places' },
    ],
  },
  {
    titleKey: 'header.nav.connect',
    items: [
      { to: '/feed', icon: Rss, labelKey: 'header.nav.feed', cat: 'community' },
      { to: '/groups', icon: UsersRound, labelKey: 'header.nav.groups', cat: 'community' },
      { to: '/users', icon: UserCheck, labelKey: 'header.nav.members', cat: 'community' },
    ],
  },
  {
    titleKey: 'header.nav.more',
    items: [
      { to: '/marketplace', icon: Store, labelKey: 'header.nav.marketplace', cat: 'marketplace' },
      { to: '/resources', icon: Tags, labelKey: 'header.nav.resources', cat: 'news' },
      { to: '/news', icon: Newspaper, labelKey: 'header.nav.news', cat: 'news' },
      { to: '/travel', icon: Plane, labelKey: 'header.nav.travel', cat: 'travel' },
      { to: '/personalities', icon: Users, labelKey: 'header.nav.personalities', cat: 'community' },
      { to: '/hotels', icon: Building, labelKey: 'header.nav.hotels', cat: 'hotels' },
      { to: '/help', icon: LifeBuoy, labelKey: 'header.nav.help', cat: 'community' },
    ],
  },
];

const userMenuItems = [
  { to: '/trips', icon: Luggage, labelKey: 'header.userMenu.myTrips' },
  { to: '/favorites', icon: Heart, labelKey: 'header.userMenu.favorites' },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const handleModeChange = async (mode: string) => {
    await updateProfile({
      user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community',
    });
  };

  // Desktop dropdown menu item click
  const handleMenuItemClick = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  // Mobile drawer navigation
  const handleDrawerNav = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
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
        {/* Drawer header */}
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
            <span className="text-base font-bold text-foreground">
              Queer Guide
            </span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDrawerOpen(false)}
            aria-label={t('header.closeMenu', 'Close menu')}
            className="h-11 w-11 p-0"
          >
            <X style={{ width: 20, height: 20 }} />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {/* User section (logged in) */}
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
                    <div className="flex items-center justify-center px-1 flex-shrink-0 bg-destructive text-destructive-foreground font-bold" style={{ minWidth: 22, height: 22, fontSize: '0.7rem' }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                  )}
                </div>

                {/* User mode selector */}
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

          {/* Login CTA (logged out) */}
          {!user && (
            <>
              <div className="px-4 py-4">
                <Button
                  variant="default"
                  size="sm"
                  style={{ width: '100%', fontWeight: 600, height: 44 }}
                  onClick={() => {
                    setDrawerOpen(false);
                    setAuthDialogOpen(true);
                  }}
                >
                  <User style={{ width: 16, height: 16, marginRight: 8 }} />
                  {t('header.signInSignUp', 'Sign In / Sign Up')}
                </Button>
              </div>
              <div className="my-2" />
            </>
          )}

          {/* Submit CTA */}
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

          {/* Navigation sections */}
          {navigationSections.map((section) => (
            <div key={section.titleKey}>
              {section.items.map((item, itemIdx) => {
                const active = isActiveRoute(item.to);
                return (
                  <button
                    key={item.to}
                    onClick={() => handleDrawerNav(item.to)}
                    className={`slide-up-in w-full flex items-center gap-2 px-4 text-left ${active ? 'bg-muted' : 'hover:bg-muted'}`}
                    style={{ minHeight: 48, animationDelay: `${itemIdx * 0.04}s` }}
                  >
                    <item.icon style={{ width: 18, height: 18, flexShrink: 0, color: active ? 'hsl(var(--brand))' : undefined }} />
                    <span className={`text-sm ${active ? 'font-semibold' : 'font-normal'}`}>
                      {t(item.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="my-2" />

          {/* User actions (logged in) */}
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

              {/* Admin link */}
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

          {/* Legal / Info */}
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

          {/* Sign out */}
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

          {/* Bottom spacer for safe area */}
          <div style={{ height: 'env(safe-area-inset-bottom, 16px)', minHeight: 16 }} />
        </div>
      </SheetContent>
    </Sheet>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <header
      className="bg-background sticky top-0"
      style={{ zIndex: 1100, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-2 sm:gap-3" style={{ height: 56 }}>
          {/* ── Logo ──────────────────────────────────────────────────── */}
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
            <motion.img
              src="/images/logo.png"
              alt=""
              aria-hidden="true"
              tabIndex={-1}
              className="brightness-0 dark:invert"
              style={{ height: 32, width: 32 }}
              whileHover={{ rotate: -6, scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            />
            <span
              className="absolute"
              style={{
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
              }}
            >
              Queer Guide
            </span>
          </Link>

          {/* ── Search ────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <UniversalSearchBar />
          </div>

          {/* ── Right side controls ───────────────────────────────────── */}

          {/* MOBILE: single hamburger button only */}
          {isMobile ? (
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
              {/* Show notification dot on hamburger when logged in with unread */}
              {user && unreadCount > 0 && (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute bg-destructive"
                    style={{
                      top: 8,
                      right: 8,
                      width: 8,
                      height: 8,
                    }}
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
          ) : (
            /* DESKTOP: all controls visible */
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Submit CTA */}
              <Button variant="default" size="sm" onClick={() => navigate(submitCta.route)}>
                <span className="inline-flex items-center font-semibold" style={{ gap: 6 }}>
                  <Plus style={{ width: 16, height: 16 }} />
                  {submitCta.label}
                </span>
              </Button>

              {/* Admin menu */}
              {(isAdmin || isModerator) && (
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ position: 'relative', height: 40, width: 40, padding: 0 }}
                  aria-label={t('header.adminConsole', 'Admin Console')}
                  title={t('header.adminConsole', 'Admin Console')}
                  onClick={() => navigate('/admin')}
                >
                  <Shield style={{ width: 16, height: 16 }} />
                </Button>
              )}

              {/* User menu */}
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
                          {unreadCount}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" style={{ width: 320, padding: 16, zIndex: 50 }}>
                    {/* User mode */}
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

                    {/* Notifications */}
                    <div className="mb-4">
                      <NotificationList />
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
                          <span className="text-sm flex-1 text-left">
                            {t(item.labelKey)}
                          </span>
                          {showBadge && (
                            <Badge variant="default" className="h-5" style={{ fontSize: '0.7rem' }}>
                              {inboxBadgeCount}
                            </Badge>
                          )}
                        </Button>
                      );
                    })}

                    <div className="my-2" />

                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ width: '100%', justifyContent: 'flex-start', color: 'hsl(var(--destructive))' }}
                      onClick={signOut}
                    >
                      <LogOut style={{ width: 16, height: 16, marginRight: 8 }} />
                      {t('header.signOut', 'Sign Out')}
                    </Button>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button onClick={() => setAuthDialogOpen(true)} size="icon" aria-label={t('header.signIn', 'Sign in')}>
                  <User style={{ width: 16, height: 16 }} />
                </Button>
              )}

              {/* Navigation dropdown (desktop) */}
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label={t('header.openNavigation', 'Open navigation menu')} aria-haspopup="menu" aria-expanded={menuOpen}>
                    <Menu style={{ width: 20, height: 20 }} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  style={{
                    width: 240,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    padding: 8,
                    zIndex: 50,
                  }}
                >
                  {navigationSections.map((section) =>
                    section.items.map((item) => {
                      const active = isActiveRoute(item.to);
                      return (
                        <Button
                          key={item.to}
                          variant={active ? 'default' : 'ghost'}
                          size="sm"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            width: '100%',
                            gap: 8,
                            padding: '8px 12px',
                          }}
                          onClick={() => handleMenuItemClick(item.to)}
                        >
                          <item.icon style={{ width: 16, height: 16 }} />
                          <span className="text-sm">{t(item.labelKey)}</span>
                        </Button>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* P4-1 — desktop primary nav row, hidden on mobile (burger drawer covers it). */}
        {!isMobile && (
          <nav
            aria-label={t('header.primaryNav', 'Primary navigation')}
            className="hidden md:flex items-center"
            style={{
              gap: 4,
              height: 40,
              borderTop: 'none',
              overflowX: 'auto',
            }}
          >
            {[
              { to: '/venues', labelKey: 'header.nav.venues' },
              { to: '/events', labelKey: 'header.nav.events' },
              { to: '/news', labelKey: 'header.nav.news' },
              { to: '/marketplace', labelKey: 'header.nav.marketplace' },
              { to: '/hotels', labelKey: 'header.nav.hotels' },
              { to: '/travel', labelKey: 'header.nav.travel' },
              { to: '/groups', labelKey: 'header.nav.groups' },
              { to: '/resources', labelKey: 'header.nav.resources' },
            ].map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    padding: '6px 10px',
                    fontSize: '0.875rem',
                    fontWeight: active ? 700 : 500,
                    opacity: active ? 1 : 0.75,
                    borderBottom: active ? '2px solid currentColor' : '2px solid transparent',
                    transition: 'opacity 0.2s',
                  }}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* Mobile drawer */}
      {isMobile && mobileDrawer}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}
