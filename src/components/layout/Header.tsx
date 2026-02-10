import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Menu, User, X, MapPin, Calendar, Store, Globe, Plane, Newspaper, CreditCard, Settings, Users, MessageSquare, FileText, LogOut, Accessibility, Tags, UserCheck, Map, Smile, Handshake, Home, Leaf, UsersRound, Rss } from 'lucide-react';
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
  return <header className="bg-background/85 backdrop-blur-xl sticky top-0 z-50 border-b border-white/20">
      <div className="container mx-auto px-4">
        {/* Main header */}
        <div className="h-16 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <img src="/images/logo.png" alt="Queer Guide Logo" className="h-8 w-8 dark:invert" />
            <span className="sr-only">Queer Guide</span>
          </Link>

          {/* Search */}
          <UniversalSearchBar />

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Admin menu - only visible to admins */}
            <AdminMenu />
            
            {/* User menu - includes notifications when logged in */}
              {user ? <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative h-10 w-10 p-0" aria-label="Open user menu">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={avatarSrc} alt={(profile?.display_name || user?.email || 'User avatar') as string} />
                      <AvatarFallback>
                        {(profile?.display_name || user?.email || 'U')?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] px-1">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-4 bg-background/90 backdrop-blur-md border-white/20 z-50">
                  {/* User mode */}
                  <div className="mb-4">
                    
                    <Select value={profile?.user_mode || 'community'} onValueChange={handleModeChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {userModes.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            <div className="flex items-center gap-2">
                              <mode.icon className="h-4 w-4" />
                              <span>{mode.label}</span>
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

                  <DropdownMenuSeparator />

                  {/* Quick actions grid */}
                  <div className="grid grid-cols-3 gap-2 p-2">
                    {userMenuItems.map(item => (
                      <Button key={item.to} variant="ghost" size="sm" className="flex flex-col items-center p-3 h-auto gap-1" onClick={() => navigate(item.to)}>
                        <item.icon className="h-4 w-4" />
                        <span className="text-xs">{item.label}</span>
                      </Button>
                     ))}
                  </div>

                  <DropdownMenuSeparator />
                  
                  <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={signOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu> : <Button onClick={() => setAuthDialogOpen(true)} size="icon" aria-label="Sign in">
                <User className="h-4 w-4" />
              </Button>}

            {/* Main menu */}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-h-[80vh] overflow-y-auto p-4 bg-background/90 backdrop-blur-md border-white/20 z-50">
                {/* Main navigation */}
                {navigationSections.map(section => <div key={section.title} className="mb-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">{section.title}</h3>
                    <div className="grid grid-cols-3 gap-2 p-2">
                      {section.items.map(item => <Button key={item.to} variant={isActiveRoute(item.to) ? "default" : "ghost"} size="sm" className={`flex flex-col items-center p-3 h-auto gap-1 ${isActiveRoute(item.to) ? 'bg-primary/15 text-primary border border-primary/20' : ''}`} onClick={() => handleMenuItemClick(item.to)}>
                          <item.icon className="h-4 w-4" />
                          <span className="text-xs">{item.label}</span>
                        </Button>)}
                    </div>
                  </div>)}

                {/* User actions for logged in users */}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>;
}