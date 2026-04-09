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
  MessageSquare,
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
  ChevronRight,
  Building,
  Luggage,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { generateAvatarUrl } from '@/lib/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationList } from '@/components/notifications/NotificationList';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import MuiDrawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTheme } from '@mui/material/styles';
import { categoryColor, resolveCategoryKey } from '@/lib/categoryColors';

// ── Data ────────────────────────────────────────────────────────────────────

const navigationSections = [
  {
    title: 'Discover',
    items: [
      { to: '/venues', icon: MapPin, label: 'Venues', cat: 'venues' },
      { to: '/events', icon: Calendar, label: 'Events', cat: 'events' },
      { to: '/places', icon: Globe, label: 'Places', cat: 'places' },
      { to: '/map', icon: Map, label: 'Map', cat: 'places' },
    ],
  },
  {
    title: 'Connect',
    items: [
      { to: '/feed', icon: Rss, label: 'Feed', cat: 'community' },
      { to: '/groups', icon: UsersRound, label: 'Groups', cat: 'community' },
      { to: '/users', icon: UserCheck, label: 'Members', cat: 'community' },
    ],
  },
  {
    title: 'More',
    items: [
      { to: '/marketplace', icon: Store, label: 'Marketplace', cat: 'marketplace' },
      { to: '/resources', icon: Tags, label: 'Resources', cat: 'news' },
      { to: '/news', icon: Newspaper, label: 'News', cat: 'news' },
      { to: '/travel', icon: Plane, label: 'Travel', cat: 'travel' },
      { to: '/personalities', icon: Users, label: 'Personalities', cat: 'community' },
      { to: '/hotels', icon: Building, label: 'Hotels', cat: 'hotels' },
    ],
  },
];

const userMenuItems = [
  { to: '/trips', icon: Luggage, label: 'My Trips' },
  { to: '/favorites', icon: Heart, label: 'Favorites' },
  { to: '/profile/settings', icon: Settings, label: 'Settings' },
  { to: '/inbox', icon: Mail, label: 'Inbox' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/my-groups', icon: UsersRound, label: 'My Groups' },
  { to: '/accessibility', icon: Accessibility, label: 'Accessibility' },
];

const userModes = [
  { value: 'dating', icon: Heart, label: 'Looking for Love' },
  { value: 'friends', icon: Users, label: 'Making Friends' },
  { value: 'exploration', icon: Map, label: 'Exploring the Scene' },
  { value: 'fun', icon: Smile, label: 'Just Here for Fun' },
  { value: 'networking', icon: Handshake, label: 'Professional Networking' },
  { value: 'community', icon: Home, label: 'Building Community' },
];

const legalItems = [
  { to: '/about', icon: Info, label: 'About' },
  { to: '/accessibility', icon: Accessibility, label: 'Accessibility' },
  { to: '/legal', icon: Scale, label: 'Legal' },
  { to: '/contact', icon: Mail, label: 'Contact' },
];

// ── Component ───────────────────────────────────────────────────────────────

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const theme = useTheme();
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { unreadCount } = useNotifications();
  const { isAdmin, isModerator } = useAdminRoles();

  const avatarSrc =
    profile?.avatar_url ||
    (user?.email ? generateAvatarUrl(user.email, 96) || undefined : undefined);

  const getSubmitCta = useCallback(() => {
    if (location.pathname.startsWith('/events'))
      return { label: 'Submit Event', route: '/submit/event' };
    if (location.pathname.startsWith('/venues'))
      return { label: 'Submit Venue', route: '/submit/venue' };
    if (location.pathname.startsWith('/marketplace'))
      return { label: 'Submit Product', route: '/submit/product' };
    if (location.pathname.startsWith('/hotels'))
      return { label: 'Submit Hotel', route: '/submit/hotel' };
    return { label: 'Contribute', route: '/submit' };
  }, [location.pathname]);
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
      PaperProps={{
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
          <img src="/images/logo.png" alt="Queer Guide" style={{ height: 28, width: 28 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Queer Guide
          </Typography>
        </Link>
        <IconButton
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          sx={{ width: 44, height: 44 }}
        >
          <X style={{ width: 20, height: 20 }} />
        </IconButton>
      </Box>

      <Divider />

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
                      borderRadius: '11px',
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
                        <span>{mode.label}</span>
                      </Box>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
            <Divider />
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
                Sign In / Sign Up
              </Button>
            </Box>
            <Divider />
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

        <Divider />

        {/* Navigation sections */}
        {navigationSections.map((section) => (
          <Box key={section.title}>
            <Typography
              variant="overline"
              sx={{
                px: 2,
                pt: 1.5,
                pb: 0.5,
                display: 'block',
                color: 'text.secondary',
                letterSpacing: 1,
              }}
            >
              {section.title}
            </Typography>
            {section.items.map((item, itemIdx) => {
              const active = isActiveRoute(item.to);
              const catKey = resolveCategoryKey(item.cat);
              return (
                <ListItemButton
                  key={item.to}
                  onClick={() => handleDrawerNav(item.to)}
                  selected={active}
                  className="slide-up-in"
                  sx={{
                    minHeight: 48,
                    px: 2,
                    animationDelay: `${itemIdx * 0.04}s`,
                    ...(active && {
                      bgcolor: 'action.selected',
                      borderRight: 3,
                      borderColor: categoryColor(catKey),
                    }),
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <item.icon style={{ width: 18, height: 18, color: active ? categoryColor(catKey) : undefined }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 600 : 400 }}
                  />
                  <ChevronRight style={{ width: 16, height: 16, opacity: 0.4 }} />
                </ListItemButton>
              );
            })}
          </Box>
        ))}

        <Divider sx={{ my: 0.5 }} />

        {/* User actions (logged in) */}
        {user && (
          <>
            <Typography
              variant="overline"
              sx={{
                px: 2,
                pt: 1.5,
                pb: 0.5,
                display: 'block',
                color: 'text.secondary',
                letterSpacing: 1,
              }}
            >
              Your Account
            </Typography>
            {userMenuItems.map((item) => (
              <ListItemButton
                key={item.to}
                onClick={() => handleDrawerNav(item.to)}
                sx={{ minHeight: 48, px: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <item.icon style={{ width: 18, height: 18 }} />
                </ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItemButton>
            ))}

            {/* Admin link */}
            {(isAdmin || isModerator) && (
              <ListItemButton
                onClick={() => handleDrawerNav('/admin')}
                sx={{ minHeight: 48, px: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Shield style={{ width: 18, height: 18 }} />
                </ListItemIcon>
                <ListItemText
                  primary="Admin Console"
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItemButton>
            )}

            <Divider sx={{ my: 0.5 }} />
          </>
        )}

        {/* Legal / Info */}
        <Typography
          variant="overline"
          sx={{
            px: 2,
            pt: 1.5,
            pb: 0.5,
            display: 'block',
            color: 'text.secondary',
            letterSpacing: 1,
          }}
        >
          Info
        </Typography>
        {legalItems.map((item) => (
          <ListItemButton
            key={item.to}
            onClick={() => handleDrawerNav(item.to)}
            sx={{ minHeight: 44, px: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <item.icon style={{ width: 16, height: 16 }} />
            </ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
          </ListItemButton>
        ))}

        {/* Sign out */}
        {user && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <ListItemButton
              onClick={() => {
                signOut();
                setDrawerOpen(false);
              }}
              sx={{ minHeight: 48, px: 2, color: 'error.main' }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                <LogOut style={{ width: 18, height: 18 }} />
              </ListItemIcon>
              <ListItemText
                primary="Sign Out"
                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
              />
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
        borderBottom: 1,
        borderColor: 'divider',
        boxShadow: 1,
        // Safe area: push content below the notch in PWA mode
        pt: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <Container maxWidth="lg">
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
            <img src="/images/logo.png" alt="Queer Guide Logo" style={{ height: 32, width: 32 }} />
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
              aria-label="Open menu"
              sx={{
                width: 44,
                height: 44,
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
                      borderRadius: '50%',
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
                  aria-label="Admin Console"
                  title="Admin Console"
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
                      aria-label="Open user menu"
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
                            borderRadius: '9999px',
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
                                <span>{mode.label}</span>
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

                    <DropdownMenuSeparator />

                    {/* Quick actions grid */}
                    <Box
                      sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 1 }}
                    >
                      {userMenuItems.map((item) => (
                        <Button
                          key={item.to}
                          variant="ghost"
                          size="sm"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: 12,
                            height: 'auto',
                            gap: 4,
                          }}
                          onClick={() => navigate(item.to)}
                        >
                          <item.icon style={{ width: 16, height: 16 }} />
                          <Typography variant="caption">{item.label}</Typography>
                        </Button>
                      ))}
                    </Box>

                    <DropdownMenuSeparator />

                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ width: '100%', justifyContent: 'flex-start', color: '#d32f2f' }}
                      onClick={signOut}
                    >
                      <LogOut style={{ width: 16, height: 16, marginRight: 8 }} />
                      Sign Out
                    </Button>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button onClick={() => setAuthDialogOpen(true)} size="icon" aria-label="Sign in">
                  <User style={{ width: 16, height: 16 }} />
                </Button>
              )}

              {/* Navigation dropdown (desktop) */}
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Open navigation menu">
                    <Menu style={{ width: 20, height: 20 }} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  style={{
                    width: 288,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    padding: 16,
                    zIndex: 50,
                  }}
                >
                  {navigationSections.map((section) => (
                    <Box key={section.title} sx={{ mb: 3 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, color: 'text.secondary', mb: 1 }}
                      >
                        {section.title}
                      </Typography>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 1,
                          p: 1,
                        }}
                      >
                        {section.items.map((item) => {
                          const catKey = resolveCategoryKey(item.cat);
                          const active = isActiveRoute(item.to);
                          return (
                          <Button
                            key={item.to}
                            variant={active ? 'default' : 'ghost'}
                            size="sm"
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              padding: 12,
                              height: 'auto',
                              gap: 4,
                              borderLeft: `3px solid ${active ? categoryColor(catKey) : 'transparent'}`,
                              ...(active
                                ? {
                                    backgroundColor:
                                      'var(--mui-palette-action-hover, rgba(124,58,237,0.08))',
                                    color: categoryColor(catKey),
                                  }
                                : {}),
                            }}
                            onClick={() => handleMenuItemClick(item.to)}
                          >
                            <item.icon style={{ width: 16, height: 16, color: active ? categoryColor(catKey) : undefined }} />
                            <Typography variant="caption">{item.label}</Typography>
                          </Button>
                          );
                        })}
                      </Box>
                    </Box>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Box>
          )}
        </Box>
      </Container>

      {/* Mobile drawer */}
      {isMobile && mobileDrawer}

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </Box>
  );
}
