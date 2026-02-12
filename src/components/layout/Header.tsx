import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Menu, User, X, MapPin, Calendar, Store, Globe, Plane, Newspaper, CreditCard, Settings, Users, MessageSquare, FileText, LogOut, Accessibility, Tags, UserCheck, Map, Smile, Handshake, Home, Leaf, UsersRound, Rss, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getGravatarUrl } from '@/lib/gravatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationList } from '@/components/notifications/NotificationList';
import { AdminMenu } from './AdminMenu';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const isActiveRoute = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };
  const {
    user,
    signOut
  } = useAuth();
  const {
    profile,
    updateProfile
  } = useProfile();
  const { unreadCount } = useNotifications();
  const avatarSrc = profile?.avatar_url || (user?.email ? getGravatarUrl(user.email, 96, 'mp') || undefined : undefined);
  const userModes = [{
    value: 'dating',
    icon: Heart,
    label: 'Looking for Love'
  }, {
    value: 'friends',
    icon: Users,
    label: 'Making Friends'
  }, {
    value: 'exploration',
    icon: Map,
    label: 'Exploring the Scene'
  }, {
    value: 'fun',
    icon: Smile,
    label: 'Just Here for Fun'
  }, {
    value: 'networking',
    icon: Handshake,
    label: 'Professional Networking'
  }, {
    value: 'community',
    icon: Home,
    label: 'Building Community'
  }];
  const navigationSections = [{
    title: "Explore",
    items: [{
      to: "/events",
      icon: Calendar,
      label: "Events"
    }, {
      to: "/places",
      icon: Globe,
      label: "Places"
    }, {
      to: "/venues",
      icon: MapPin,
      label: "Venues"
    }, {
      to: "/marketplace",
      icon: Store,
      label: "Marketplace"
    }, {
      to: "/resources",
      icon: Tags,
      label: "Resources"
    }, {
      to: "/news",
      icon: Newspaper,
      label: "News"
    }, {
      to: "/personalities",
      icon: Users,
      label: "Personalities"
    }]
  }, {
    title: "Community",
    items: [{
      to: "/feed",
      icon: Rss,
      label: "Feed"
    }, {
      to: "/groups",
      icon: UsersRound,
      label: "Groups"
    }, {
      to: "/users",
      icon: UserCheck,
      label: "Members"
    }]
  }];
  const userMenuItems = [{
    to: "/favorites",
    icon: Heart,
    label: "Favorites"
  }, {
    to: "/profile/settings",
    icon: Settings,
    label: "Settings"
  }, {
    to: "/messages",
    icon: MessageSquare,
    label: "Messages"
  }, {
    to: "/friends",
    icon: Users,
    label: "Friends"
  }, {
    to: "/my-groups",
    icon: UsersRound,
    label: "My Groups"
  }, {
    to: "/accessibility",
    icon: Accessibility,
    label: "Accessibility"
  }];
  const handleModeChange = async (mode: string) => {
    await updateProfile({
      user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community'
    });
  };
  const handleMenuItemClick = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };
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
      }}
    >
      <Container maxWidth="lg">
        {/* Main header */}
        <Box sx={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, textDecoration: 'none' }}>
            <img src="/images/logo.png" alt="Queer Guide Logo" style={{ height: 32, width: 32 }} />
            <Box
              component="span"
              sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
            >
              Queer Guide
            </Box>
          </Link>

          {/* Search */}
          <UniversalSearchBar />

          {/* Right side controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Submit a Space CTA */}
            <Button
              variant="default"
              size="sm"
              style={{ display: undefined }}
              onClick={() => navigate('/admin/venues')}
            >
              <Box
                component="span"
                sx={{
                  display: { xs: 'none', sm: 'inline-flex' },
                  alignItems: 'center',
                  gap: 0.75,
                  fontWeight: 600,
                }}
              >
                <Plus style={{ width: 16, height: 16 }} />
                Submit a Space
              </Box>
            </Button>

            {/* Admin menu - only visible to admins */}
            <AdminMenu />

            {/* User menu - includes notifications when logged in */}
              {user ? <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" style={{ position: 'relative', height: 40, width: 40, padding: 0 }} aria-label="Open user menu">
                    <Avatar style={{ height: 36, width: 36 }}>
                      <AvatarImage src={avatarSrc} alt={(profile?.display_name || user?.email || 'User avatar') as string} />
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

                  {/* Notifications */}
                  <Box sx={{ mb: 2 }}>
                    <NotificationList />
                  </Box>

                  <DropdownMenuSeparator />

                  {/* Quick actions grid */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 1 }}>
                    {userMenuItems.map(item => (
                      <Button key={item.to} variant="ghost" size="sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 12, height: 'auto', gap: 4 }} onClick={() => navigate(item.to)}>
                        <item.icon style={{ width: 16, height: 16 }} />
                        <Typography variant="caption">{item.label}</Typography>
                      </Button>
                     ))}
                  </Box>

                  <DropdownMenuSeparator />

                  <Button variant="ghost" size="sm" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--destructive)' }} onClick={signOut}>
                    <LogOut style={{ width: 16, height: 16, marginRight: 8 }} />
                    Sign Out
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu> : <Button onClick={() => setAuthDialogOpen(true)} size="icon" aria-label="Sign in">
                <User style={{ width: 16, height: 16 }} />
              </Button>}

            {/* Main menu */}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Open navigation menu">
                  <Menu style={{ width: 20, height: 20 }} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={{ width: 288, maxHeight: '80vh', overflowY: 'auto', padding: 16, zIndex: 50 }}>
                {/* Main navigation */}
                {navigationSections.map(section => (
                  <Box key={section.title} sx={{ mb: 3 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary', mb: 1 }}>
                      {section.title}
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 1 }}>
                      {section.items.map(item => (
                        <Button
                          key={item.to}
                          variant={isActiveRoute(item.to) ? "default" : "ghost"}
                          size="sm"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: 12,
                            height: 'auto',
                            gap: 4,
                            ...(isActiveRoute(item.to) ? {
                              backgroundColor: 'rgba(var(--primary-rgb, 124, 58, 237), 0.15)',
                              color: 'var(--primary)',
                              border: '1px solid rgba(var(--primary-rgb, 124, 58, 237), 0.2)',
                            } : {}),
                          }}
                          onClick={() => handleMenuItemClick(item.to)}
                        >
                          <item.icon style={{ width: 16, height: 16 }} />
                          <Typography variant="caption">{item.label}</Typography>
                        </Button>
                      ))}
                    </Box>
                  </Box>
                ))}

                {/* Submit a Space CTA (mobile) */}
                <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider', display: { xs: 'block', sm: 'none' } }}>
                  <Button
                    variant="default"
                    size="sm"
                    style={{ width: '100%', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                    onClick={() => handleMenuItemClick('/admin/venues')}
                  >
                    <Plus style={{ width: 16, height: 16 }} />
                    Submit a Space
                  </Button>
                </Box>
              </DropdownMenuContent>
            </DropdownMenu>
          </Box>
        </Box>
      </Container>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </Box>
  );
}
