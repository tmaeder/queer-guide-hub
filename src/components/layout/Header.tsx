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
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

import Typography from '@mui/material/Typography';
import MuiDrawer from '@mui/material/Drawer';
import { motion } from 'motion/react';
import IconButton from '@mui/material/IconButton';
import ListItemButton from '@mui/material/ListItemButton';
import { useTheme } from '@mui/material/styles';

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

  const theme = useTheme();
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
    <MuiDrawer
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      anchor="right"
      transitionDuration={{ enter: 300, exit: 200 }}
      PaperProps={{
        id: 'mobile-nav-drawer',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('header.navigation', 'Navigation'),
        sx: {
          width: { xs: '100%', sm: 320 },
          pt: 'env(safe-area-inset-top, 0px)',
          pb: 'env(safe-area-inset-bottom, 0px)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      // Improve accessibility
      ModalProps={{ keepMounted: false }}
    >
      {/* Drawer header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Link
          to="/"
          onClick={() => setDrawerOpen(false)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
        >
          <img
            src="/images/logo.png"
            alt="Queer Guide"
            style={{
              height: 28,
              width: 28,
              filter: theme.palette.mode === 'dark' ? 'brightness(0) invert(1)' : 'brightness(0)',
            }}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Queer Guide
          </Typography>
        </Link>
        <IconButton
          onClick={() => setDrawerOpen(false)}
          aria-label={t('header.closeMenu', 'Close menu')}
          sx={{ width: 44, height: 44 }}
        >
          <X style={{ width: 20, height: 20 }} />
        </IconButton>
      </Box>

      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {/* User section (logged in) */}
        {user && (
          <>
            <Box sx={{ px: 2, py: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Avatar style={{ height: 40, width: 40 }}>
                  <AvatarImage
                    src={avatarSrc}
                    alt={(profile?.display_name || user?.email || 'User') as string}
                  />
                  <AvatarFallback>
                    {(profile?.display_name || user?.email || 'U')?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {profile?.display_name || 'User'}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                    }}
                  >
                    {user.email}
                  </Typography>
                </Box>
                {unreadCount > 0 && (
                  <Box
                    sx={{
                      minWidth: 22,
                      height: 22,
                      borderRadius: 0,
                      bgcolor: 'error.main',
                      color: 'error.contrastText',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      px: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Box>
                )}
              </Box>

              {/* User mode selector */}
              <Select value={profile?.user_mode || 'community'} onValueChange={handleModeChange}>
                <SelectTrigger style={{ width: '100%' }}>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {userModes.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <mode.icon style={{ width: 16, height: 16 }} />
                        <span>{t(mode.labelKey)}</span>
                      </Box>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
            <Box sx={{ my: 1 }} />
          </>
        )}

        {/* Login CTA (logged out) */}
        {!user && (
          <>
            <Box sx={{ px: 2, py: 2 }}>
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
            </Box>
            <Box sx={{ my: 1 }} />
          </>
        )}

        {/* Submit CTA */}
        <Box sx={{ px: 2, py: 1.5 }}>
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
        </Box>

        {/* Navigation sections */}
        {navigationSections.map((section) => (
          <Box key={section.title}>
            {section.items.map((item, itemIdx) => {
              const active = isActiveRoute(item.to);
              return (
                <ListItemButton
                  key={item.to}
                  onClick={() => handleDrawerNav(item.to)}
                  selected={active}
                  className="slide-up-in"
                  sx={{
                    minHeight: 48,
                    px: 2,
                    gap: 1,
                    animationDelay: `${itemIdx * 0.04}s`,
                    ...(active && {
                      bgcolor: 'action.selected',
                    }),
                  }}
                >
                  <item.icon style={{ width: 18, height: 18, flexShrink: 0, color: active ? 'hsl(var(--brand))' : undefined }} />
                  <Typography variant="body2" sx={{ fontWeight: active ? 600 : 400 }}>
                    {t(item.labelKey)}
                  </Typography>
                </ListItemButton>
              );
            })}
          </Box>
        ))}

        <Box sx={{ my: 1 }} />

        {/* User actions (logged in) */}
        {user && (
          <>
            {userMenuItems.map((item) => {
              const showBadge = item.to === '/trips' && inboxBadgeCount > 0;
              return (
                <ListItemButton
                  key={item.to}
                  onClick={() => handleDrawerNav(item.to)}
                  sx={{ minHeight: 48, px: 2, gap: 1 }}
                >
                  <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ flex: 1 }}>{t(item.labelKey)}</Typography>
                  {showBadge && (
                    <Chip
                      label={inboxBadgeCount}
                      size="small"
                      color="primary"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                </ListItemButton>
              );
            })}

            {/* Admin link */}
            {(isAdmin || isModerator) && (
              <ListItemButton
                onClick={() => handleDrawerNav('/admin')}
                sx={{ minHeight: 48, px: 2, gap: 1 }}
              >
                <Shield style={{ width: 18, height: 18, flexShrink: 0 }} />
                <Typography variant="body2">{t('header.adminConsole', 'Admin Console')}</Typography>
              </ListItemButton>
            )}

            <Box sx={{ my: 1 }} />
          </>
        )}

        {/* Legal / Info */}
        {legalItems.map((item) => (
          <ListItemButton
            key={item.to}
            onClick={() => handleDrawerNav(item.to)}
            sx={{ minHeight: 44, px: 2, gap: 1 }}
          >
            <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} />
            <Typography variant="body2">{t(item.labelKey)}</Typography>
          </ListItemButton>
        ))}

        {/* Sign out */}
        {user && (
          <>
            <Box sx={{ my: 1 }} />
            <ListItemButton
              onClick={() => {
                signOut();
                setDrawerOpen(false);
              }}
              sx={{ minHeight: 48, px: 2, gap: 1, color: 'error.main' }}
            >
              <LogOut style={{ width: 18, height: 18, flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('header.signOut', 'Sign Out')}</Typography>
            </ListItemButton>
          </>
        )}

        {/* Bottom spacer for safe area */}
        <Box sx={{ height: 'env(safe-area-inset-bottom, 16px)', minHeight: 16 }} />
      </Box>
    </MuiDrawer>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Box
      component="header"
      sx={{
        bgcolor: 'background.default',
        position: 'sticky',
        top: 0,
        zIndex: 'appBar',
        // Safe area: push content below the notch in PWA mode
        pt: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 } }}>
        <Box
          sx={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, sm: 1.5 },
          }}
        >
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
              alt="Queer Guide Logo"
              style={{
                height: 32,
                width: 32,
                filter: theme.palette.mode === 'dark' ? 'brightness(0) invert(1)' : 'brightness(0)',
              }}
              whileHover={{ rotate: -6, scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            />
            <Box
              component="span"
              sx={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
              }}
            >
              Queer Guide
            </Box>
          </Link>

          {/* ── Search ────────────────────────────────────────────────── */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <UniversalSearchBar />
          </Box>

          {/* ── Right side controls ───────────────────────────────────── */}

          {/* MOBILE: single hamburger button only */}
          {isMobile ? (
            <IconButton
              onClick={() => setDrawerOpen(true)}
              aria-label={t('header.openMenu', 'Open menu')}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              sx={{
                width: 48,
                height: 48,
                flexShrink: 0,
                color: 'text.primary',
                // Notification dot
                position: 'relative',
              }}
            >
              <Menu style={{ width: 22, height: 22 }} />
              {/* Show notification dot on hamburger when logged in with unread */}
              {user && unreadCount > 0 && (
                <>
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 8,
                      height: 8,
                      borderRadius: 0,
                      bgcolor: 'error.main',
                    }}
                  />
                  <Box
                    component="span"
                    role="status"
                    aria-live="polite"
                    sx={{
                      position: 'absolute',
                      width: 1,
                      height: 1,
                      overflow: 'hidden',
                      clip: 'rect(0,0,0,0)',
                    }}
                  >
                    {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                  </Box>
                </>
              )}
            </IconButton>
          ) : (
            /* DESKTOP: all controls visible */
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
              {/* Submit CTA */}
              <Button variant="default" size="sm" onClick={() => navigate(submitCta.route)}>
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 600 }}
                >
                  <Plus style={{ width: 16, height: 16 }} />
                  {submitCta.label}
                </Box>
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
                          alt={(profile?.display_name || user?.email || 'User avatar') as string}
                        />
                        <AvatarFallback>
                          {(profile?.display_name || user?.email || 'U')?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {unreadCount > 0 && (
                        <Box
                          component="span"
                          sx={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            display: 'inline-flex',
                            minWidth: '1.25rem',
                            height: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 0,
                            bgcolor: 'error.main',
                            color: 'error.contrastText',
                            fontSize: '10px',
                            px: 0.5,
                          }}
                        >
                          {unreadCount}
                        </Box>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" style={{ width: 320, padding: 16, zIndex: 50 }}>
                    {/* User mode */}
                    <Box sx={{ mb: 2 }}>
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
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <mode.icon style={{ width: 16, height: 16 }} />
                                <span>{t(mode.labelKey)}</span>
                              </Box>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Box>

                    {/* Notifications */}
                    <Box sx={{ mb: 2 }}>
                      <NotificationList />
                    </Box>

                    <Box sx={{ my: 1 }} />

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
                          <Typography variant="body2" sx={{ flex: 1, textAlign: 'left' }}>
                            {t(item.labelKey)}
                          </Typography>
                          {showBadge && (
                            <Chip
                              label={inboxBadgeCount}
                              size="small"
                              color="primary"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                        </Button>
                      );
                    })}

                    <Box sx={{ my: 1 }} />

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
                          <Typography variant="body2">{t(item.labelKey)}</Typography>
                        </Button>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </Box>
          )}
        </Box>

        {/* P4-1 — desktop primary nav row, hidden on mobile (burger drawer covers it). */}
        {!isMobile && (
          <Box
            component="nav"
            aria-label={t('header.primaryNav', 'Primary navigation')}
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              gap: 0.5,
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
          </Box>
        )}
      </Box>

      {/* Mobile drawer */}
      {isMobile && mobileDrawer}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </Box>
  );
}
