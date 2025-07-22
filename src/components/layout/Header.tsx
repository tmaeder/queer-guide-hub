import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Menu, User, X, MapPin, Calendar, Store, Globe, Plane, Newspaper, CreditCard, Settings, Users, MessageSquare, FileText, LogOut, Accessibility, Tags, UserCheck, Map, Smile, Handshake, Home, Leaf } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Header() {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    user,
    signOut
  } = useAuth();
  const { profile, updateProfile } = useProfile();

  const userModes = [
    { value: 'dating', icon: Heart, label: 'Dating' },
    { value: 'friends', icon: Users, label: 'Friends' },
    { value: 'exploration', icon: Map, label: 'Exploration' },
    { value: 'fun', icon: Smile, label: 'Fun' },
    { value: 'networking', icon: Handshake, label: 'Networking' },
    { value: 'community', icon: Home, label: 'Community' },
  ];

  const navigationItems = [
    { to: "/venues", icon: MapPin, label: "Venues" },
    { to: "/events", icon: Calendar, label: "Events" },
    { to: "/marketplace", icon: Store, label: "Market" },
    { to: "/users", icon: Users, label: "Users" },
    { to: "/groups", icon: UserCheck, label: "Groups" },
    { to: "/tags", icon: Tags, label: "Wiki" },
    { to: "/directory", icon: Globe, label: "Locations" },
    { to: "/travel", icon: Plane, label: "Travel" },
    { to: "/news", icon: Newspaper, label: "News" },
  ];

  const userMenuItems = [
    
    { to: "/favorites", icon: Heart, label: "Favorites" },
    { to: "/profile/settings", icon: Settings, label: "My Profile" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/friends", icon: Users, label: "Friends" },
    { to: "/accessibility", icon: Accessibility, label: "Access" },
  ];

  const handleModeChange = async (mode: string) => {
    await updateProfile({ user_mode: mode as 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community' });
  };

  const handleMenuItemClick = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };
  return (
    <header className="bg-card/50 backdrop-blur-sm sticky top-0 z-50 border-b border-border/50">
      <div className="container mx-auto px-4">
        {/* Main header */}
        <div className="h-16 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <Heart className="h-8 w-8 text-primary fill-current" />
            {!isMobile && (
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Queer Guide
              </span>
            )}
          </Link>

          {/* Search - Hidden on mobile when menu is open */}
          {!isMobile && <UniversalSearchBar />}

          {/* All navigation now in hamburger menu */}

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            {user && <NotificationBell />}
            
            {/* User menu */}
            {user && !isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-4 bg-background border border-border">
                  {/* User mode selector */}
                  <div className="flex items-center justify-between p-2 mb-3">
                    <span className="text-sm font-medium">Current Mode</span>
                    <Select value={profile?.user_mode || 'exploration'} onValueChange={handleModeChange}>
                      <SelectTrigger className="w-40">
                        <SelectValue>
                          <div className="flex items-center gap-2">
                            {(() => {
                              const CurrentIcon = userModes.find(m => m.value === profile?.user_mode)?.icon;
                              return CurrentIcon ? <CurrentIcon className="h-4 w-4" /> : null;
                            })()}
                            <span>{userModes.find(m => m.value === profile?.user_mode)?.label}</span>
                          </div>
                        </SelectValue>
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

                  {/* Quick actions grid */}
                  <div className="grid grid-cols-3 gap-2 p-2">
                    {userMenuItems.map((item) => (
                      <Button 
                        key={item.to}
                        variant="ghost" 
                        size="sm" 
                        className="flex flex-col items-center p-3 h-auto gap-1" 
                        onClick={() => navigate(item.to)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="text-xs">{item.label}</span>
                      </Button>
                    ))}
                  </div>

                  <DropdownMenuSeparator />
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start text-destructive hover:text-destructive" 
                    onClick={signOut}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : !user && !isMobile && (
              <Button onClick={() => setAuthDialogOpen(true)} size="sm" className="h-9">
                <User className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}

            {/* Hamburger menu for all navigation */}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-11 w-11 p-0">
                  {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-[300px] max-h-[80vh] overflow-y-auto p-0 bg-background border border-border"
                sideOffset={8}
              >

                {/* Main navigation */}
                <div className="p-2">
                  <div className="mb-2">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1 px-2">Explore</h3>
                    {navigationItems.map((item) => (
                      <DropdownMenuItem key={item.to} className="p-0">
                        <Button
                          variant="ghost"
                          className="w-full justify-start h-11 text-base px-2"
                          onClick={() => handleMenuItemClick(item.to)}
                        >
                          <item.icon className="h-5 w-5 mr-3" />
                          {item.label}
                        </Button>
                      </DropdownMenuItem>
                    ))}
                  </div>

                </div>

              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </header>
  );
}